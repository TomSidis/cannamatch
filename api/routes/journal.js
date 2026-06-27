import { Router }  from "express";
import { pool }     from "../db.js";
import { DEFAULT_DNA } from "../constants.js";
import { verifySession }       from "../security/claudeProxyShield.js";
import { updateDNAFromJournal } from "../lib/dnaProfile.js";
import {
  EFFECT_IDS,
  SIDE_EFFECT_IDS,
  filterToClosedList,
} from "../lib/journalConfig.js";
import { updateUserDNAProfile }        from "../lib/dnaProfile.js";
import { treatmentJournalToFeedback }  from "../lib/treatmentJournalFeedback.js";
import { journalToReviewPayload }      from "../lib/journalToReview.js";
import { computeReportWeight }         from "../../src/engine/reportTrust.ts";
import { checkLicenseGate }            from "../lib/licenseExpiry.js";
import { aggregateAnomalyScore }       from "../lib/anomalyHooks.js";

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

// ── POST /api/journal/treatment — private treatment journal ──────────────────
// Creates a minimal entry (rating + strain_id required; all else optional).
// effects / side_effects are filtered to the closed list in journalConfig.js.
// side_effects_other (free text) is stored in its own column, never fed to the
// DNA profile.  DNA update wired in C2.4.
router.post("/treatment", verifySession, async (req, res) => {
  const {
    strain_id,
    rating,
    grow_batch_id,
    photo_url,
    notes,
    effects           = [],
    side_effects      = [],
    side_effects_other,
  } = req.body;

  if (!strain_id) {
    return res.status(400).json({ error: { message: "strain_id חובה." } });
  }
  if (
    rating == null ||
    typeof rating !== "number" ||
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5
  ) {
    return res.status(400).json({ error: { message: "rating חייב להיות מספר שלם בין 1–5." } });
  }

  const cleanEffects     = filterToClosedList(effects,      EFFECT_IDS);
  const cleanSideEffects = filterToClosedList(side_effects, SIDE_EFFECT_IDS);

  const unknownEffects     = effects.filter((id) => !EFFECT_IDS.has(id));
  const unknownSideEffects = side_effects.filter((id) => !SIDE_EFFECT_IDS.has(id) && id !== "other");
  if (unknownEffects.length || unknownSideEffects.length) {
    console.warn(
      "[journal] unknown-effect-ids userId=%s effects=%d side_effects=%d",
      req.userId, unknownEffects.length, unknownSideEffects.length,
    );
  }
  const cleanSideOther   = typeof side_effects_other === "string"
    ? side_effects_other.replace(/[<>"'`]/g, "").slice(0, 300).trim() || null
    : null;
  const cleanPhotoUrl    = typeof photo_url === "string"
    ? photo_url.replace(/[<>"'`]/g, "").slice(0, 2000).trim() || null
    : null;
  const cleanNotes       = typeof notes === "string"
    ? notes.replace(/[<>"'`]/g, "").slice(0, 2000).trim() || null
    : null;
  const cleanBatchId     = typeof grow_batch_id === "string"
    ? grow_batch_id.replace(/[^A-Za-z0-9\-_]/g, "").slice(0, 60).trim() || null
    : null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: [entry] } = await client.query(
      `INSERT INTO treatment_journal
         (user_id, strain_id, grow_batch_id, rating, photo_url, notes,
          effects, side_effects, side_effects_other)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, created_at`,
      [
        req.userId,
        strain_id,
        cleanBatchId,
        rating,
        cleanPhotoUrl,
        cleanNotes,
        cleanEffects.length      ? cleanEffects      : null,
        cleanSideEffects.length  ? cleanSideEffects  : null,
        cleanSideOther,
      ],
    );

    // ── DNA profile update (non-fatal) ──────────────────────────
    // notes and side_effects_other are intentionally NOT passed — they stay private.
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
        const feedback = treatmentJournalToFeedback({
          rating,
          effects:      cleanEffects,
          side_effects: cleanSideEffects,
        });
        const updated = updateUserDNAProfile(profRow?.profile || DEFAULT_DNA, strain, feedback);
        await client.query(
          `INSERT INTO user_dna_profiles (user_id, profile) VALUES ($1,$2)
           ON CONFLICT (user_id) DO UPDATE SET profile=$2, updated_at=now()`,
          [req.userId, updated],
        );
      }
    } catch (dnaErr) {
      console.warn("[journal] treatment DNA update failed (non-fatal) —", dnaErr.message);
    }

    await client.query("COMMIT");
    res.status(201).json({ status: "ok", id: entry.id, created_at: entry.created_at });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("treatment journal POST error:", err);
    res.status(500).json({ error: { message: "שגיאה בשמירת יומן טיפול" } });
  } finally {
    client.release();
  }
});

// ── GET /api/journal/treatment — per-user treatment journal list ──────────────
// Must be registered before GET /:userId to prevent "treatment" matching as a userId param.
router.get("/treatment", verifySession, async (req, res) => {
  const limit  = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;

  try {
    const { rows } = await pool.query(
      `SELECT j.id, j.strain_id, s.name AS strain_name,
              j.grow_batch_id, j.rating, j.photo_url, j.notes,
              j.effects, j.side_effects, j.side_effects_other, j.created_at,
              r.id AS review_id
       FROM treatment_journal j
       LEFT JOIN strains s ON s.id = j.strain_id
       LEFT JOIN user_reviews r ON r.journal_entry_id = j.id
       WHERE j.user_id = $1
       ORDER BY j.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.userId, limit, offset],
    );
    res.json({ count: rows.length, entries: rows });
  } catch (err) {
    console.error("treatment journal GET error:", err);
    res.status(500).json({ error: { message: "שגיאה בשליפת יומן טיפול" } });
  }
});

// ── PATCH /api/journal/treatment/:id — add effects/side_effects after first save ──
// Updates effects, side_effects, side_effects_other ONLY.
// Notes, photo_url and rating are immutable via this endpoint.
// Ownership guard: returns 404 for both non-existent and other-user entries
// (does not reveal whether the entry exists at all).
router.patch("/treatment/:id", verifySession, async (req, res) => {
  const {
    effects           = [],
    side_effects      = [],
    side_effects_other,
  } = req.body;

  const cleanEffects     = filterToClosedList(effects,      EFFECT_IDS);
  const cleanSideEffects = filterToClosedList(side_effects, SIDE_EFFECT_IDS);
  const cleanSideOther   = typeof side_effects_other === "string"
    ? side_effects_other.replace(/[<>"'`]/g, "").slice(0, 300).trim() || null
    : null;

  const unknownEffects     = effects.filter((id) => !EFFECT_IDS.has(id));
  const unknownSideEffects = side_effects.filter((id) => !SIDE_EFFECT_IDS.has(id) && id !== "other");
  if (unknownEffects.length || unknownSideEffects.length) {
    console.warn(
      "[journal] unknown-effect-ids userId=%s effects=%d side_effects=%d",
      req.userId, unknownEffects.length, unknownSideEffects.length,
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Ownership guard — 404 whether the entry doesn't exist or belongs to another user.
    // Never 403: that would confirm the entry exists.
    const { rows: [owned] } = await client.query(
      `SELECT id FROM treatment_journal WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.userId],
    );
    if (!owned) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: { message: "רשומה לא נמצאה." } });
    }

    const { rows: [updated] } = await client.query(
      `UPDATE treatment_journal
       SET effects = $1, side_effects = $2, side_effects_other = $3
       WHERE id = $4 AND user_id = $5
       RETURNING id, strain_id, rating, effects, side_effects, side_effects_other, created_at`,
      [
        cleanEffects.length     ? cleanEffects     : null,
        cleanSideEffects.length ? cleanSideEffects : null,
        cleanSideOther,
        req.params.id,
        req.userId,
      ],
    );

    // ── DNA profile update (non-fatal) ──────────────────────────
    // notes and side_effects_other are intentionally NOT passed — they stay private.
    try {
      const { rows: [profRow] } = await client.query(
        `SELECT profile FROM user_dna_profiles WHERE user_id=$1 FOR UPDATE`, [req.userId],
      );
      const { rows: [strain] } = await client.query(
        `SELECT s.lineage, b.embedding FROM strains s
         LEFT JOIN LATERAL (SELECT embedding FROM batches WHERE strain_id=s.id LIMIT 1) b ON TRUE
         WHERE s.id=$1`,
        [updated.strain_id],
      );
      if (strain) {
        const feedback = treatmentJournalToFeedback({
          rating:       updated.rating,
          effects:      updated.effects      ?? [],
          side_effects: updated.side_effects ?? [],
        });
        const profileUpdated = updateUserDNAProfile(profRow?.profile || DEFAULT_DNA, strain, feedback);
        await client.query(
          `INSERT INTO user_dna_profiles (user_id, profile) VALUES ($1,$2)
           ON CONFLICT (user_id) DO UPDATE SET profile=$2, updated_at=now()`,
          [req.userId, profileUpdated],
        );
      }
    } catch (dnaErr) {
      console.warn("[journal] treatment DNA update failed (non-fatal) —", dnaErr.message);
    }

    await client.query("COMMIT");
    const { strain_id: _sid, rating: _r, ...publicFields } = updated;
    res.json({ status: "ok", ...publicFields });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("treatment journal PATCH error:", err);
    res.status(500).json({ error: { message: "שגיאה בעדכון יומן טיפול" } });
  } finally {
    client.release();
  }
});

// ── POST /api/journal/treatment/:id/share — publish journal entry to community ──
// Copies (not flips) a private journal entry into user_reviews as an anonymous report.
// Privacy contract:
//   • journalToReviewPayload() structurally excludes notes + side_effects_other.
//   • Response contains only { status, review_id, trust_weight } — no user_id, no journal_entry_id.
//   • Journal entry is never modified by this operation.
// Idempotent: second call returns the existing review_id (200).
router.post("/treatment/:id/share", verifySession, async (req, res) => {
  const journalId = req.params.id;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Ownership guard — 404 for non-existent AND other-user entries
    const { rows: [entry] } = await client.query(
      `SELECT * FROM treatment_journal WHERE id = $1 AND user_id = $2`,
      [journalId, req.userId],
    );
    if (!entry) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: { message: "רשומה לא נמצאה." } });
    }

    // 2. License gate — community contribution is gated (same as POST /reviews, C1)
    let isVerifiedPatient = false;
    try {
      const { rows: [userRow] } = await client.query(
        `SELECT license_verified, license_expiry FROM users WHERE id = $1`, [req.userId],
      );
      isVerifiedPatient = !!userRow?.license_verified;
      const gate = checkLicenseGate(userRow);
      if (gate.blocked) {
        await client.query("ROLLBACK");
        return res.status(403).json({ error: { message: gate.message } });
      }
    } catch { /* license columns may not exist before migration 010 — treat as unverified */ }

    // 3. Idempotency — already shared?
    const { rows: [existing] } = await client.query(
      `SELECT id FROM user_reviews WHERE journal_entry_id = $1`,
      [journalId],
    );
    if (existing) {
      await client.query("ROLLBACK");
      return res.json({ status: "ok", review_id: existing.id });
    }

    // 4. Privacy gateway — structural exclusion of notes/side_effects_other
    const payload = journalToReviewPayload(entry);

    // 5. Trust computation — grow_batch_id=null is handled gracefully (batchVerified=false)
    let batchVerified = false;
    if (payload.batch_id) {
      try {
        const { rows: [batchRow] } = await client.query(
          `SELECT id FROM grow_batch WHERE id = $1`, [payload.batch_id],
        );
        batchVerified = !!batchRow;
      } catch { /* grow_batch may not exist yet */ }
    }
    const userReliabilityScore = await aggregateAnomalyScore(req.userId, pool, { strainId: entry.strain_id });
    const trustWeight = computeReportWeight({
      isVerifiedPatient,
      hasPhoto:            !!entry.photo_url,
      batchVerified,
      userReliabilityScore,
    });

    // 6. INSERT — journal_entry_id is internal only, never returned in response
    // No DNA update: already done at journal creation (C2)
    const { rows: [review] } = await client.query(
      `INSERT INTO user_reviews
         (user_id, strain_id, efficacy, anxiety_triggered, pain_relief, sleep_quality,
          side_effects, trust_weight, photo_url, batch_id, batch_verified, is_verified_patient,
          journal_entry_id, is_seed)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id, trust_weight`,
      [
        req.userId,
        payload.strain_id,
        payload.efficacy,
        payload.anxiety_triggered,
        payload.pain_relief,
        payload.sleep_quality,
        payload.side_effects,
        trustWeight,
        payload.photo_url,
        payload.batch_id,
        batchVerified,
        isVerifiedPatient,
        journalId,
        false, // is_seed: real user share, never a seed
      ],
    );

    await client.query("COMMIT");
    res.json({ status: "ok", review_id: review.id, trust_weight: review.trust_weight });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("treatment share error:", err);
    res.status(500).json({ error: { message: "שגיאה בשיתוף הדיווח" } });
  } finally {
    client.release();
  }
});

// ── DELETE /api/journal/treatment/:id/share — remove public review (unshare) ──
// Deletes the community review linked to this journal entry.
// Journal entry is NOT modified — it remains private and intact.
// Ownership guard: 404 for both non-existent and other-user reviews (no info leak).
router.delete("/treatment/:id/share", verifySession, async (req, res) => {
  const journalId = req.params.id;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Ownership guard: find via journal_entry_id + user_id on user_reviews.
    // 404 regardless of whether the entry doesn't exist or belongs to someone else.
    const { rows: [review] } = await client.query(
      `SELECT r.id FROM user_reviews r WHERE r.journal_entry_id = $1 AND r.user_id = $2`,
      [journalId, req.userId],
    );
    if (!review) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: { message: "דיווח לא נמצא." } });
    }

    await client.query(`DELETE FROM user_reviews WHERE id = $1`, [review.id]);
    await client.query("COMMIT");

    // 204: journal entry untouched — only the public review was removed
    res.status(204).end();
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("treatment unshare error:", err);
    res.status(500).json({ error: { message: "שגיאה בביטול השיתוף" } });
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
