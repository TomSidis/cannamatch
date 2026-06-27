import express from "express";
import { pool } from "../db.js";
import { verifySession } from "../security/claudeProxyShield.js";

const router = express.Router();

// ── GET /api/impact ───────────────────────────────────────────────────────────
// Returns the authenticated user's helped-me impact: total aggregate count
// and a per-report breakdown ordered by helped_count DESC.
//
// Source of truth: review_interactions joined to user_reviews.
// Read-only — no write path. The only way impact grows is when other users
// press "עזר לי" on the caller's public reports (that path is in feed.js, C4).
//
// Anonymity: counts only — no identity of who marked helped is returned.
// Scope: session-only. There is intentionally no /:userId variant —
//        a user can only see their own impact.
// Seed posts: is_seed = false filter — admin-seeded data is not the user's impact.

router.get("/impact", verifySession, async (req, res) => {
  const userId = req.userId;

  try {
    // Aggregate: total helped-me marks across all the user's public reports
    const aggResult = await pool.query(
      `SELECT COUNT(ri.id)::int AS total
       FROM review_interactions ri
       JOIN user_reviews r ON r.id = ri.review_id
       WHERE r.user_id = $1 AND r.is_seed = false`,
      [userId],
    );
    const total = aggResult.rows[0]?.total ?? 0;

    // Per-report breakdown: each public report with its helped-me count
    const breakdown = await pool.query(
      `SELECT r.id         AS review_id,
              s.name       AS strain_name,
              COUNT(ri.id)::int AS helped_count
       FROM user_reviews r
       JOIN strains s ON s.id = r.strain_id
       LEFT JOIN review_interactions ri ON ri.review_id = r.id
       WHERE r.user_id = $1 AND r.is_seed = false
       GROUP BY r.id, s.id
       ORDER BY helped_count DESC, r.created_at DESC`,
      [userId],
    );

    return res.json({ total, reports: breakdown.rows });
  } catch (err) {
    console.error("GET /impact:", err);
    return res.status(500).json({ error: { message: "שגיאה בטעינת נתוני ההשפעה." } });
  }
});

export default router;
