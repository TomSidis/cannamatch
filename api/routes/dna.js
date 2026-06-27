import { Router }   from "express";
import { pool }      from "../db.js";
import { DEFAULT_DNA, CHECKIN_REPLIES, pickReply } from "../constants.js";
import {
  updateUserDNAProfile,
  applyCheckin,
} from "../lib/dnaProfile.js";
import { verifySession } from "../security/claudeProxyShield.js";
import { bridgeScore } from "../../src/engine/legacyBridge.ts";

const router = Router();


// ── GET /api/dna/:userId ──────────────────────────────────────
router.get("/dna/:userId", async (req, res) => {
  const { userId } = req.params;
  if (!userId) return res.status(400).json({ error: { message: "חסר userId." } });

  try {
    const { rows } = await pool.query(
      `SELECT profile FROM user_dna_profiles WHERE user_id = $1`, [userId],
    );
    if (!rows.length) {
      await pool.query(
        `INSERT INTO user_dna_profiles (user_id, profile) VALUES ($1,$2) ON CONFLICT (user_id) DO NOTHING`,
        [userId, DEFAULT_DNA],
      );
      return res.json(DEFAULT_DNA);
    }
    res.json(rows[0].profile);
  } catch (err) {
    console.error("GET dna error:", err);
    res.status(500).json({ error: { message: "שגיאה בשליפת הפרופיל" } });
  }
});

// ── PUT /api/dna/:userId ──────────────────────────────────────
router.put("/dna/:userId", async (req, res) => {
  const { strain_id, feedback } = req.body;
  const { userId } = req.params;

  if (!strain_id) return res.status(400).json({ error: { message: "חסר strain_id." } });

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const { rows: [profRow] } = await client.query(
      `SELECT profile FROM user_dna_profiles WHERE user_id=$1 FOR UPDATE`, [userId],
    );
    const profile = profRow?.profile || DEFAULT_DNA;

    const { rows: [strain] } = await client.query(
      `SELECT s.lineage, b.embedding FROM strains s
       LEFT JOIN LATERAL (SELECT embedding FROM batches WHERE strain_id=s.id LIMIT 1) b ON TRUE
       WHERE s.id=$1`,
      [strain_id],
    );
    if (!strain) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: { message: "זן לא נמצא" } });
    }

    const updated = updateUserDNAProfile(profile, strain, feedback);
    await client.query(
      `INSERT INTO user_dna_profiles (user_id, profile) VALUES ($1,$2)
       ON CONFLICT (user_id) DO UPDATE SET profile=$2, updated_at=now()`,
      [userId, updated],
    );
    await client.query("COMMIT");
    res.json(updated);
  } catch (err) {
    if (client) try { await client.query("ROLLBACK"); } catch {}
    console.error("PUT dna error:", err);
    res.status(500).json({ error: { message: "שגיאה בעדכון הפרופיל" } });
  } finally {
    client?.release();
  }
});

// ── POST /api/dna/:id/checkin ─────────────────────────────────
router.post("/dna/:id/checkin", async (req, res) => {
  const { dimension, value } = req.body;
  if (!dimension || !value) {
    return res.status(400).json({ error: { message: "חסר dimension או value." } });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: [row] } = await client.query(
      `SELECT profile FROM user_dna_profiles WHERE user_id=$1 FOR UPDATE`,
      [req.params.id],
    );
    const profile = row?.profile || DEFAULT_DNA;
    const updated = applyCheckin(profile, dimension, value);

    await client.query(
      `INSERT INTO user_dna_profiles (user_id, profile) VALUES ($1,$2)
       ON CONFLICT (user_id) DO UPDATE SET profile=$2, updated_at=now()`,
      [req.params.id, updated],
    );

    await client.query(
      `INSERT INTO checkin_log (user_id, dimension, value) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [req.params.id, dimension, value],
    ).catch(() => {});

    await client.query("COMMIT");

    // ── Rank safe strains with unified scoring engine ─────────
    let safeTargets = [];
    try {
      const { rows: dbStrains } = await client.query(
        `SELECT s.id, s.name, s.genetics, s.lineage, s.terpene_dist,
                s.target_indications, s.genetic_confidence,
                b.category, b.product_type
         FROM strains s
         LEFT JOIN LATERAL (
           SELECT category, product_type FROM batches
           WHERE strain_id = s.id AND in_stock = TRUE
           ORDER BY price ASC LIMIT 1
         ) b ON TRUE
         WHERE s.terpene_dist IS NOT NULL
         LIMIT 80`,
      );

      const safeAns = {
        cats:         [...new Set(dbStrains.map((r) => r.category || "T22/C4"))],
        reasons:      updated.indications      || [],
        killSwitches: updated.blocked_triggers || [],
      };

      const ranked = dbStrains
        .map((r) => ({
          id:      r.id,
          name:    r.name,
          cat:     r.category || "T22/C4",
          terps:   r.terpene_dist || {},
          effects: r.target_indications || [],
          type:    r.product_type || "flower",
        }))
        .map(s => {
          const r = bridgeScore(s, safeAns);
          return { ...s, match: r.matchPct, confidence: r.confidence };
        })
        .filter(s => s.match > 0)
        .sort((a, b) => b.match - a.match || b.confidence - a.confidence);

      if (ranked.length) {
        safeTargets = ranked.slice(0, 3).map((s) => ({
          name:       s.name,
          category:   s.cat,
          match:      s.match,
          confidence: s.confidence,
        }));
      }
    } catch (e) {
      console.warn("checkin: safe-targets query failed —", e.message);
    }

    res.json({
      profile:      updated,
      message:      pickReply(CHECKIN_REPLIES[value] || ["קלטתי! עדכנתי לך את הפרופיל. 🌿"]),
      safe_targets: safeTargets,
    });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("checkin error:", err);
    res.status(500).json({ error: { message: "שגיאת שרת בעדכון הצ'ק-אין" } });
  } finally {
    client.release();
  }
});

// ── GET /api/match/:userId — ranked strains via Engine 2 (scorer.ts) ──────────
router.get("/match/:userId", verifySession, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 40, 200);
  try {
    const { rows: [profRow] } = await pool.query(
      `SELECT profile FROM user_dna_profiles WHERE user_id=$1`, [req.userId],
    );
    const dna = profRow?.profile || DEFAULT_DNA;

    const { rows: strains } = await pool.query(
      `SELECT s.id, s.name, s.genetics, s.lineage, s.genetic_confidence,
              s.terpene_dist,
              b.category, b.product_type, b.price, b.in_stock,
              ph.name AS pharmacy_name
       FROM strains s
       LEFT JOIN LATERAL (
         SELECT category, product_type, price, in_stock, pharmacy_id
         FROM batches
         WHERE strain_id = s.id AND in_stock = TRUE
         ORDER BY price ASC LIMIT 1
       ) b ON TRUE
       LEFT JOIN pharmacies ph ON ph.id = b.pharmacy_id
       WHERE b.category IS NOT NULL
       LIMIT $1`,
      [limit],
    );

    const dnaAns = {
      cats:         dna.categories       || [],
      reasons:      dna.indications      || [],
      killSwitches: dna.blocked_triggers || [],
    };

    const ranked = strains
      .map((s) => {
        const r = bridgeScore({
          id:    s.id,
          cat:   s.category || 'T22/C4',
          terps: s.terpene_dist || {},
        }, dnaAns);
        return {
          id:             s.id,
          name:           s.name,
          genetics:       s.genetics,
          category:       s.category,
          product_type:   s.product_type,
          price:          s.price,
          in_stock:       s.in_stock,
          pharmacy_name:  s.pharmacy_name,
          match:          r.matchPct,
          confidence:     r.confidence,
          reasonHuman:    r.reasonHuman,
          topLayer:       r.topLayer,
        };
      })
      .filter(s => s.match > 0)
      .sort((a, b) => b.match - a.match || b.confidence - a.confidence);

    res.json({ count: ranked.length, strains: ranked });
  } catch (err) {
    console.error("match error:", err);
    res.status(500).json({ error: { message: "שגיאת שרת בחישוב התאמות" } });
  }
});

export default router;
