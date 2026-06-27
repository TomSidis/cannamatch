import express from "express";
import { pool } from "../db.js";
import { verifySession } from "../security/claudeProxyShield.js";
import { validateComment } from "../lib/commentFilter.js";

// Strip HTML/script chars from free text — same pattern as social.js sanitizeText.
// Length is validated (and rejected) by validateComment before this runs.
function sanitizeBody(val) {
  if (typeof val !== "string") return "";
  return val.replace(/[<>"'`]/g, "").trim();
}

const router = express.Router();

// ── GET /api/feed ─────────────────────────────────────────────────────────────
// Trust-ranked community feed, with optional relevance tier for users who have
// a DNA profile. Anonymized: user_id is never returned in any feed item.
//
// Ranking rules:
//   • No profile / empty indications  → ORDER BY trust_weight DESC (safe default)
//   • Has indications                 → relevance tier first (indication overlap),
//                                       then trust_weight DESC within each tier
//   • helped_me_count is display-only — NEVER in ORDER BY

router.get("/feed", verifySession, async (req, res) => {
  try {
    const limit      = Math.min(parseInt(req.query.limit  ?? "20", 10), 50);
    const offset     = parseInt(req.query.offset ?? "0",  10);
    const userId     = req.userId;
    // Category filter — only show reports from authors with matching license category.
    // Empty array = no filter (general feed).
    const categories = req.query.categories
      ? req.query.categories.split(",").map(s => s.trim()).filter(Boolean)
      : [];

    // Established-user detection: non-empty indications in DNA profile
    const profileResult = await pool.query(
      "SELECT profile FROM user_dna_profiles WHERE user_id = $1",
      [userId],
    );
    const indications  = profileResult.rows[0]?.profile?.indications ?? [];
    const isEstablished = indications.length > 0;

    let feedRows;

    if (isEstablished) {
      // Reports matching the user's indication(s) come first (tier 1);
      // within each tier, higher trust_weight ranks higher.
      const { rows } = await pool.query(
        `SELECT
           r.id,
           r.strain_id,
           s.name                                        AS strain_name,
           s.genetics,
           s.target_indications,
           r.efficacy,
           r.anxiety_triggered,
           r.pain_relief,
           r.sleep_quality,
           r.side_effects,
           r.trust_weight,
           r.photo_url,
           r.created_at,
           COUNT(ri.id)::int                             AS helped_me_count,
           COALESCE(BOOL_OR(ri.user_id = $3), FALSE)    AS user_helped,
           CASE WHEN s.target_indications && $4::text[]
                THEN 1 ELSE 0 END                       AS relevance_tier
         FROM user_reviews r
         JOIN strains s ON s.id = r.strain_id
         JOIN users u ON u.id = r.user_id
         LEFT JOIN review_interactions ri ON ri.review_id = r.id
         WHERE r.is_seed = false
           AND ($5::text[] = '{}' OR u.license_categories && $5::text[])
         GROUP BY r.id, s.id
         ORDER BY relevance_tier DESC, r.trust_weight DESC, r.created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset, userId, indications, categories],
      );
      // relevance_tier is an internal sort field — not part of the public response
      feedRows = rows.map(({ relevance_tier: _rt, ...rest }) => rest);
    } else {
      // No profile: trust-ranked only
      const { rows } = await pool.query(
        `SELECT
           r.id,
           r.strain_id,
           s.name                                        AS strain_name,
           s.genetics,
           s.target_indications,
           r.efficacy,
           r.anxiety_triggered,
           r.pain_relief,
           r.sleep_quality,
           r.side_effects,
           r.trust_weight,
           r.photo_url,
           r.created_at,
           COUNT(ri.id)::int                             AS helped_me_count,
           COALESCE(BOOL_OR(ri.user_id = $3), FALSE)    AS user_helped
         FROM user_reviews r
         JOIN strains s ON s.id = r.strain_id
         JOIN users u ON u.id = r.user_id
         LEFT JOIN review_interactions ri ON ri.review_id = r.id
         WHERE r.is_seed = false
           AND ($4::text[] = '{}' OR u.license_categories && $4::text[])
         GROUP BY r.id, s.id
         ORDER BY r.trust_weight DESC, r.created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset, userId, categories],
      );
      // Paranoid strip: user_id must never appear in any feed item,
      // even if a future schema change or raw query accidentally SELECTs it.
      feedRows = rows.map(({ user_id: _uid, ...rest }) => rest);
    }

    return res.json({ feed: feedRows, offset, limit });
  } catch (err) {
    console.error("GET /feed:", err);
    return res.status(500).json({ error: { message: "שגיאה בטעינת הפיד." } });
  }
});

// ── POST /api/feed/:id/help ───────────────────────────────────────────────────
// "Helped me" toggle. One interaction per (user, review) — UNIQUE constraint
// in review_interactions enforces this at the DB level.
//
// First call  → INSERT → { helped: true,  count: N }
// Second call → unique_violation → DELETE → { helped: false, count: N-1 }
// Review not found → FK violation (23503) → 404

router.post("/feed/:id/help", verifySession, async (req, res) => {
  const reviewId = req.params.id;
  const userId   = req.userId;

  try {
    await pool.query(
      "INSERT INTO review_interactions (user_id, review_id) VALUES ($1, $2)",
      [userId, reviewId],
    );
    // Insertion succeeded → user now helps this report
    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS count FROM review_interactions WHERE review_id = $1",
      [reviewId],
    );
    return res.json({ helped: true, count: rows[0].count });
  } catch (err) {
    if (err.code === "23503") {
      // FK violation: review_id doesn't exist
      return res.status(404).json({ error: { message: "דיווח לא נמצא." } });
    }
    if (err.code === "23505") {
      // Unique violation: user already marked this → toggle off
      await pool.query(
        "DELETE FROM review_interactions WHERE user_id = $1 AND review_id = $2",
        [userId, reviewId],
      );
      const { rows } = await pool.query(
        "SELECT COUNT(*)::int AS count FROM review_interactions WHERE review_id = $1",
        [reviewId],
      );
      return res.json({ helped: false, count: rows[0].count });
    }
    throw err;
  }
});

// ── POST /api/feed/:id/comments ──────────────────────────────────────────────
// Create a comment on a community report. Anonymous in response (no user_id).
//
// Threading (single-level only):
//   parent_id null   → root comment
//   parent_id = UUID → reply; parent must itself be a root (parent_id IS NULL).
//                      Replies-to-replies are rejected (400). Enforced here since
//                      the DB constraint only checks FK existence, not depth.
//
// Filter: validateComment(body) → rejection returns 400 with reason.
// XSS:    sanitizeBody strips <>"'` before INSERT.

router.post("/feed/:id/comments", verifySession, async (req, res) => {
  try {
    const reviewId = req.params.id;
    const userId   = req.userId;
    const { body, parent_id = null } = req.body;

    // 1. Filter check (before sanitizing — filter sees the raw input)
    const filterResult = validateComment(body);
    if (!filterResult.ok) {
      return res.status(400).json({ error: { message: "תגובה נדחתה.", reason: filterResult.reason } });
    }

    // 2. Sanitize
    const cleanBody = sanitizeBody(body);
    if (cleanBody.length === 0) {
      return res.status(400).json({ error: { message: "גוף התגובה ריק לאחר עיבוד." } });
    }

    // 3. Single-level threading: if parent_id supplied, validate it is a root comment
    if (parent_id) {
      const parentResult = await pool.query(
        "SELECT id, parent_id FROM review_comments WHERE id = $1 AND review_id = $2",
        [parent_id, reviewId],
      );
      if (parentResult.rows.length === 0) {
        return res.status(404).json({ error: { message: "תגובת-הורה לא נמצאה." } });
      }
      if (parentResult.rows[0].parent_id !== null) {
        return res.status(400).json({ error: { message: "לא ניתן להגיב לתגובה שהיא עצמה תגובה." } });
      }
    }

    // 4. INSERT — user_id stored for ownership guard, never returned
    const { rows } = await pool.query(
      `INSERT INTO review_comments (review_id, user_id, parent_id, body)
       VALUES ($1, $2, $3, $4)
       RETURNING id, parent_id, body, created_at`,
      [reviewId, userId, parent_id, cleanBody],
    );
    const comment = rows[0];
    return res.status(201).json({ id: comment.id, parent_id: comment.parent_id, body: comment.body, created_at: comment.created_at });
  } catch (err) {
    if (err.code === "23503") {
      return res.status(404).json({ error: { message: "דיווח לא נמצא." } });
    }
    console.error("POST /feed/:id/comments:", err);
    return res.status(500).json({ error: { message: "שגיאה בשמירת התגובה." } });
  }
});

// ── GET /api/feed/:id/comments ────────────────────────────────────────────────
// Threaded comments for a report. Anonymous: no user_id returned.
// Structure: root comments with inline `replies` array (single level).

router.get("/feed/:id/comments", verifySession, async (req, res) => {
  try {
    const reviewId = req.params.id;
    const { rows } = await pool.query(
      `SELECT id, parent_id, body, created_at
       FROM review_comments
       WHERE review_id = $1
       ORDER BY created_at ASC`,
      [reviewId],
    );

    // Build single-level tree in JS.
    // Paranoid strip: user_id must never appear in any comment or reply.
    const strip = ({ user_id: _uid, ...rest }) => rest;
    const roots   = rows.filter(r => r.parent_id === null).map(strip);
    const replies = rows.filter(r => r.parent_id !== null).map(strip);
    const tree    = roots.map(root => ({
      ...root,
      replies: replies.filter(r => r.parent_id === root.id),
    }));

    return res.json({ comments: tree });
  } catch (err) {
    console.error("GET /feed/:id/comments:", err);
    return res.status(500).json({ error: { message: "שגיאה בטעינת תגובות." } });
  }
});

// ── DELETE /api/feed/:id/comments/:cid ───────────────────────────────────────
// Delete own comment. Ownership guard: 404 (not 403) — same body whether the
// comment doesn't exist or belongs to another user (no info leak).

router.delete("/feed/:id/comments/:cid", verifySession, async (req, res) => {
  try {
    const { cid } = req.params;
    const userId  = req.userId;

    const result = await pool.query(
      "DELETE FROM review_comments WHERE id = $1 AND user_id = $2",
      [cid, userId],
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: { message: "רשומה לא נמצאה." } });
    }
    return res.status(204).send();
  } catch (err) {
    console.error("DELETE /feed/:id/comments/:cid:", err);
    return res.status(500).json({ error: { message: "שגיאה במחיקת התגובה." } });
  }
});

export default router;
