import { Router }   from "express";
import { pool }      from "../db.js";
import { DEFAULT_DNA, CHECKIN_REPLIES, pickReply } from "../constants.js";
import {
  updateUserDNAProfile,
  applyCheckin,
  calculateMatchScoreWithExplanation,
} from "../lib/scoring.js";
import { verifySession } from "../security/claudeProxyShield.js";
import { scoreAll }      from "../../src/lib/scoringEngine.js";
import { TERPENES, REASONS } from "../../src/data/strainsConfig.js";

const router = Router();

// Trigger threshold: terpene fraction above which a blocked terpene fires the filter
const TRIGGER_THRESH = 0.15;

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

      const triggers = updated.trigger_terpenes || {};
      const safe = dbStrains
        .map((r) => ({
          id:      r.id,
          name:    r.name,
          cat:     r.category || "T22/C4",
          terps:   r.terpene_dist || {},
          effects: r.target_indications || [],
          type:    r.product_type || "flower",
          lineage: r.lineage,
          genetic_confidence: r.genetic_confidence,
        }))
        .filter((s) => {
          const total = Object.values(s.terps).reduce((a, v) => a + v, 0) || 1;
          return Object.entries(triggers).every(([terp, weight]) => {
            const frac = (s.terps[terp] || 0) / total;
            return !(weight >= 0.6 && frac >= TRIGGER_THRESH);
          });
        });

      if (safe.length) {
        const ans = {
          cats:      [...new Set(safe.map((s) => s.cat))],
          reasons:   updated.indications || [],
          flavors:   Object.keys(updated.target_terpenes || {}),
          helped: [], notHelped: [], current: [],
        };
        const ranked = scoreAll(ans, {}, { strains: safe, terpenes: TERPENES, reasons: REASONS });
        safeTargets = ranked.slice(0, 3).map((s) => ({
          name:       s.name,
          category:   s.cat,
          match:      s.match,
          confidence: s.genetic_confidence || "unverified",
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

// ── GET /api/match/:userId — ranked strains with full explanation ──
// Adaptive weights + score shrinkage run server-side only.
// Raw weight internals are stripped before the response is sent.
router.get("/match/:userId", verifySession, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 40, 200);
  try {
    const { rows: [profRow] } = await pool.query(
      `SELECT profile FROM user_dna_profiles WHERE user_id=$1`, [req.userId],
    );
    const dna = profRow?.profile || DEFAULT_DNA;

    const { rows: strains } = await pool.query(
      `SELECT s.id, s.name, s.genetics, s.lineage, s.genetic_confidence,
              b.category, b.product_type, b.price, b.in_stock,
              b.embedding, b.data_confidence, b.terpene_source,
              ph.name AS pharmacy_name
       FROM strains s
       LEFT JOIN LATERAL (
         SELECT category, product_type, price, in_stock, embedding,
                data_confidence, terpene_source, pharmacy_id
         FROM batches
         WHERE strain_id = s.id AND in_stock = TRUE
         ORDER BY price ASC LIMIT 1
       ) b ON TRUE
       LEFT JOIN pharmacies ph ON ph.id = b.pharmacy_id
       WHERE b.embedding IS NOT NULL
       LIMIT $1`,
      [limit],
    );

    const community = 0.5;
    const ranked = strains
      .map((s) => {
        const batchMeta = {
          terpene_source:     s.terpene_source    || "unknown",
          data_confidence:    s.data_confidence   ?? 0.5,
          genetic_confidence: s.genetic_confidence || "unverified",
        };
        const { score, explanation } = calculateMatchScoreWithExplanation(dna, s, community, batchMeta);
        const { weights: _w, ...safeExplanation } = explanation || {};
        return { ...s, match: score, explanation: safeExplanation };
      })
      .sort((a, b) => b.match - a.match);

    res.json({ count: ranked.length, strains: ranked });
  } catch (err) {
    console.error("match error:", err);
    res.status(500).json({ error: { message: "שגיאת שרת בחישוב התאמות" } });
  }
});

export default router;
