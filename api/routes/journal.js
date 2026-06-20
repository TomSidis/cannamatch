import { Router }  from "express";
import { pool }     from "../db.js";
import { DEFAULT_DNA } from "../constants.js";
import { verifySession }       from "../security/claudeProxyShield.js";
import { updateDNAFromJournal } from "../lib/scoring.js";

const router = Router();

// Valid route-of-administration values (enforced server-side)
const VALID_ROUTES = new Set(["smoke","vape","oil","edible","sublingual","topical","other"]);

// ── POST /api/journal ─────────────────────────────────────────
router.post("/", verifySession, async (req, res) => {
  const {
    batch_id, strain_id,
    dose_mg, route, time_of_day, context_tags = [],
    pain_relief, sleep_quality, mood, anxiety_level, functional_impairment,
    notes_encrypted, side_effects = [], onset_minutes, duration_hours,
  } = req.body;

  // Input validation
  if (route && !VALID_ROUTES.has(route)) {
    return res.status(400).json({ error: { message: `route לא תקין: ${route}` } });
  }
  const likertFields = { pain_relief, sleep_quality, mood, anxiety_level, functional_impairment };
  for (const [field, val] of Object.entries(likertFields)) {
    if (val != null && (typeof val !== "number" || val < 1 || val > 5)) {
      return res.status(400).json({ error: { message: `${field} חייב להיות בין 1–5.` } });
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: [entry] } = await client.query(
      `INSERT INTO bio_journal
         (user_id, batch_id, strain_id, dose_mg, route, time_of_day, context_tags,
          pain_relief, sleep_quality, mood, anxiety_level, functional_impairment,
          notes_encrypted, side_effects, onset_minutes, duration_hours)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING id, recorded_at`,
      [
        req.userId, batch_id || null, strain_id || null,
        dose_mg || null, route || null, time_of_day || null, context_tags,
        pain_relief || null, sleep_quality || null, mood || null,
        anxiety_level || null, functional_impairment || null,
        notes_encrypted || null, side_effects,
        onset_minutes || null, duration_hours || null,
      ],
    );

    // ── Update DNA profile from journal signal (non-fatal) ──
    if (strain_id) {
      try {
        const { rows: [profRow] } = await client.query(
          `SELECT profile FROM user_dna_profiles WHERE user_id=$1 FOR UPDATE`, [req.userId],
        );
        const { rows: [strain] } = await client.query(
          `SELECT s.lineage, b.embedding FROM strains s
           LEFT JOIN LATERAL (SELECT embedding FROM batches WHERE strain_id=s.id LIMIT 1) b ON TRUE
           WHERE s.id=$1`,
          [strain_id],
        );
        if (strain) {
          const updated = updateDNAFromJournal(
            profRow?.profile || DEFAULT_DNA,
            strain,
            { pain_relief, sleep_quality, mood, anxiety_level },
          );
          await client.query(
            `INSERT INTO user_dna_profiles (user_id, profile) VALUES ($1,$2)
             ON CONFLICT (user_id) DO UPDATE SET profile=$2, updated_at=now()`,
            [req.userId, updated],
          );
        }
      } catch (dnaErr) {
        console.warn("journal: DNA update failed (non-fatal) —", dnaErr.message);
      }
    }

    await client.query("COMMIT");
    res.status(201).json({ status: "ok", id: entry.id, recorded_at: entry.recorded_at });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("journal POST error:", err);
    res.status(500).json({ error: { message: "שגיאה בשמירת יומן" } });
  } finally {
    client.release();
  }
});

// ── GET /api/journal/:userId ──────────────────────────────────
router.get("/:userId", verifySession, async (req, res) => {
  const limit  = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;

  try {
    const { rows } = await pool.query(
      `SELECT j.id, j.batch_id, j.strain_id, s.name AS strain_name,
              j.recorded_at, j.dose_mg, j.route, j.time_of_day, j.context_tags,
              j.pain_relief, j.sleep_quality, j.mood, j.anxiety_level,
              j.functional_impairment, j.side_effects, j.onset_minutes, j.duration_hours
       FROM bio_journal j
       LEFT JOIN strains s ON s.id = j.strain_id
       WHERE j.user_id = $1
       ORDER BY j.recorded_at DESC
       LIMIT $2 OFFSET $3`,
      [req.params.userId, limit, offset],
    );
    res.json({ count: rows.length, entries: rows });
  } catch (err) {
    console.error("journal GET error:", err);
    res.status(500).json({ error: { message: "שגיאה בשליפת יומן" } });
  }
});

export default router;
