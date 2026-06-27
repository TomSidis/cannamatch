import { Router }  from "express";
import { pool }     from "../db.js";
import { DEFAULT_DNA } from "../constants.js";
import { updateUserDNAProfile } from "../lib/dnaProfile.js";
import { twinScore }             from "../lib/vectorMath.js";
import { getGeneticTwins, getCollaborativeRecommendations } from "../lib/recommendations.js";
import { computeReportWeight }    from "../../src/engine/reportTrust.ts";
import { aggregateAnomalyScore } from "../lib/anomalyHooks.js";
import { checkLicenseGate }      from "../lib/licenseExpiry.js";

const router = Router();

// ── GET /api/social/twins/:id — DNA-similarity feed ──────────
router.get("/social/twins/:id", async (req, res) => {
  try {
    const { rows: [me] } = await pool.query(
      `SELECT profile FROM user_dna_profiles WHERE user_id=$1`, [req.params.id],
    );
    if (!me) return res.json([]);

    const { rows: others } = await pool.query(
      `SELECT u.id, u.pseudonym, p.profile FROM user_dna_profiles p
       JOIN users u ON u.id = p.user_id WHERE p.user_id != $1`,
      [req.params.id],
    );

    const ranked = others
      .map((o) => ({ ...o, score: twinScore(me.profile, o.profile) }))
      .filter((o) => o.score > 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    if (!ranked.length) return res.json([]);

    const { rows: reviews } = await pool.query(
      `SELECT DISTINCT ON (r.user_id, r.strain_id)
              r.user_id, r.efficacy,
              s.name, s.genetics, s.lineage, s.terpene_dist, s.target_indications
       FROM user_reviews r
       JOIN strains s ON s.id = r.strain_id
       WHERE r.user_id = ANY($1) AND r.efficacy >= 4
       ORDER BY r.user_id, r.strain_id, r.efficacy DESC`,
      [ranked.map((t) => t.id)],
    );

    const getTopTerpene = (d) => {
      const e = Object.entries(d || {}).sort((a, b) => b[1] - a[1])[0];
      return e ? e[0] : "";
    };

    const feed = reviews
      .map((rv) => {
        const twin = ranked.find((t) => t.id === rv.user_id);
        return {
          similarity:  Math.round((twin?.score || 0) * 100),
          city:        "ישראל",
          indication:  (rv.target_indications || [])[0] || "כללי",
          strain:      rv.name,
          genetics:    rv.genetics,
          lineage:     rv.lineage,
          topTerpene:  getTopTerpene(rv.terpene_dist),
          rating:      rv.efficacy,
        };
      })
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 8);

    res.json(feed);
  } catch (err) {
    console.error("twins error:", err);
    res.status(500).json({ error: { message: "שגיאת שרת בשליפת תאומים גנטיים" } });
  }
});

// ── GET /api/social/genetic-twins/:userId ─────────────────────
router.get("/social/genetic-twins/:userId", async (req, res) => {
  try {
    const twins = await getGeneticTwins(req.params.userId, Number(req.query.limit) || 10);
    res.json({ count: twins.length, twins });
  } catch (err) {
    console.error("genetic-twins error:", err);
    res.status(500).json({ error: { message: "שגיאת שרת בחיפוש תאומים גנטיים" } });
  }
});

// ── GET /api/recommendations/:userId ─────────────────────────
router.get("/recommendations/:userId", async (req, res) => {
  try {
    const { indication, limit = 10 } = req.query;
    const recs = await getCollaborativeRecommendations(req.params.userId, indication, Number(limit));
    res.json({ count: recs.length, recommendations: recs });
  } catch (err) {
    console.error("recommendations error:", err);
    res.status(500).json({ error: { message: "שגיאת שרת בחישוב המלצות" } });
  }
});

// Sanitize free-text strings: strip HTML/script chars, enforce max length
function sanitizeText(val, maxLen = 500) {
  if (typeof val !== "string") return "";
  return val.replace(/[<>"'`]/g, "").slice(0, maxLen).trim();
}

// Validate batch_id format: alphanumeric + hyphens/underscores, max 60 chars
function sanitizeBatchId(val) {
  if (typeof val !== "string") return "";
  return val.replace(/[^A-Za-z0-9\-_]/g, "").slice(0, 60).trim();
}

// ── POST /api/reviews ─────────────────────────────────────────
router.post("/reviews", async (req, res) => {
  const {
    user_id, strain_id, efficacy,
    anxietyTriggered, painRelief, sleepQuality,
    sideEffects = [], indication,
    batch_id, photo_url,           // Q11: optional trust-signal fields
  } = req.body;

  if (!user_id || !strain_id || efficacy == null) {
    return res.status(400).json({ error: { message: "חסרים שדות חובה: user_id, strain_id, efficacy." } });
  }
  if (typeof efficacy !== "number" || efficacy < 1 || efficacy > 10) {
    return res.status(400).json({ error: { message: "efficacy חייב להיות מספר בין 1–10." } });
  }

  // Sanitize free-text fields
  const cleanIndication  = sanitizeText(indication || "");
  const cleanSideEffects = (Array.isArray(sideEffects) ? sideEffects : [])
    .map((s) => sanitizeText(s, 100)).slice(0, 10);
  const cleanBatchId     = sanitizeBatchId(batch_id || "");
  const cleanPhotoUrl    = sanitizeText(photo_url || "", 2000);

  // Pre-transaction read: anomaly hooks are read-only; running them outside
  // the write transaction avoids extending lock duration unnecessarily.
  // All hooks return undefined today → userReliabilityScore is undefined → 1.0 in computeReportWeight.
  const userReliabilityScore = await aggregateAnomalyScore(user_id, pool, { strainId: strain_id });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Per-user abuse guard: max 1 review per strain per 24h
    const { rows: [recent] } = await client.query(
      `SELECT id FROM user_reviews
       WHERE user_id=$1 AND strain_id=$2 AND created_at > now() - interval '24 hours'
       LIMIT 1`,
      [user_id, strain_id],
    );
    if (recent) {
      await client.query("ROLLBACK");
      return res.status(429).json({ error: { message: "כבר דיווחת על זן זה היום — ניתן לדווח שוב מחר." } });
    }

    // ── Q11: Compute trust weight ──────────────────────────────
    // Fetch license state. Also enforces the community contribution gate:
    //   verified patient with expired license → 403 (core app remains open).
    //   unverified user → passes through at anonymous floor (Q11 policy).
    let isVerifiedPatient = false;
    let licenseWarning    = null;
    try {
      const { rows: [userRow] } = await client.query(
        `SELECT license_verified, license_expiry FROM users WHERE id = $1`, [user_id],
      );
      isVerifiedPatient = !!userRow?.license_verified;

      const gate = checkLicenseGate(userRow);
      if (gate.blocked) {
        await client.query("ROLLBACK");
        return res.status(403).json({ error: { message: gate.message } });
        // `finally { client.release() }` still runs after this return.
      }
      licenseWarning = gate.warning;
    } catch { /* columns may not exist before migration 010 — treat as unverified, no gate */ }

    // Check batch cross-reference
    let batchVerified = false;
    if (cleanBatchId) {
      try {
        const { rows: [batchRow] } = await client.query(
          `SELECT id FROM grow_batch WHERE id = $1`, [cleanBatchId],
        );
        batchVerified = !!batchRow;
      } catch { /* grow_batch may not exist yet */ }
    }

    const trustWeight = computeReportWeight({
      isVerifiedPatient,
      hasPhoto:            !!cleanPhotoUrl,
      batchVerified,
      userReliabilityScore, // undefined today → treated as 1.0 by computeReportWeight
    });

    const rev = await client.query(
      `INSERT INTO user_reviews
         (user_id, strain_id, efficacy, anxiety_triggered, pain_relief, sleep_quality,
          side_effects, trust_weight, photo_url, batch_id, batch_verified, is_verified_patient)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [
        user_id, strain_id, efficacy, anxietyTriggered, painRelief, sleepQuality,
        cleanSideEffects,
        trustWeight,
        cleanPhotoUrl || null,
        cleanBatchId  || null,
        batchVerified,
        isVerifiedPatient,
      ],
    );

    const { rows: [profRow] } = await client.query(
      `SELECT profile FROM user_dna_profiles WHERE user_id=$1 FOR UPDATE`, [user_id],
    );
    const { rows: [strain] } = await client.query(
      `SELECT s.lineage, b.embedding FROM strains s
       LEFT JOIN LATERAL (SELECT embedding FROM batches WHERE strain_id=s.id LIMIT 1) b ON TRUE
       WHERE s.id=$1`,
      [strain_id],
    );

    const updated = updateUserDNAProfile(
      profRow?.profile || DEFAULT_DNA,
      strain || { lineage: "", embedding: new Array(12).fill(0) },
      { efficacy, anxietyTriggered, painRelief, sleepQuality, indication: cleanIndication },
    );

    await client.query(
      `INSERT INTO user_dna_profiles (user_id, profile) VALUES ($1,$2)
       ON CONFLICT (user_id) DO UPDATE SET profile=$2, updated_at=now()`,
      [user_id, updated],
    );
    await client.query("COMMIT");

    res.json({ status: "ok", review_id: rev.rows[0].id, trust_weight: trustWeight, profile: updated, licenseWarning });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("review error:", err);
    res.status(500).json({ error: { message: "שגיאה בשמירת הביקורת" } });
  } finally {
    client.release();
  }
});

export default router;
