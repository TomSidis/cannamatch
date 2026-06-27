import express from "express";
import { pool } from "../db.js";
import { verifySession } from "../security/claudeProxyShield.js";
import { TERMS_VERSION, TERMS_TEXT } from "../lib/termsConfig.js";

const router = express.Router();

// ── GET /api/terms/status ─────────────────────────────────────────────────────
// Returns whether the authenticated user has accepted the current terms version.
// Includes the full terms text so the client never holds an independent copy
// that could drift from the versioned text on the server.
//
// Response: { accepted: boolean, version: number, text: string }

router.get("/terms/status", verifySession, async (req, res) => {
  const userId = req.userId;

  try {
    const { rows } = await pool.query(
      `SELECT id FROM terms_acceptances
       WHERE user_id = $1 AND terms_version = $2`,
      [userId, TERMS_VERSION],
    );

    return res.json({
      accepted: rows.length > 0,
      version:  TERMS_VERSION,
      text:     TERMS_TEXT,
    });
  } catch (err) {
    console.error("GET /terms/status:", err);
    return res.status(500).json({ error: { message: "שגיאה בבדיקת אישור תנאים." } });
  }
});

// ── POST /api/terms/accept ────────────────────────────────────────────────────
// Records acceptance of the current terms version.
//
// Security invariants (do not relax):
//   • user_id  — always from req.userId (session JWT), never from request body.
//   • version  — always from TERMS_VERSION server constant, never from request body.
//     The client cannot claim acceptance of an arbitrary version.
//
// Idempotent: ON CONFLICT DO NOTHING — double-accept returns 200, no error, no duplicate row.

router.post("/terms/accept", verifySession, async (req, res) => {
  const userId = req.userId; // from session — req.body is intentionally ignored

  try {
    await pool.query(
      `INSERT INTO terms_acceptances (user_id, terms_version)
       VALUES ($1, $2)
       ON CONFLICT (user_id, terms_version) DO NOTHING`,
      [userId, TERMS_VERSION],
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error("POST /terms/accept:", err);
    return res.status(500).json({ error: { message: "שגיאה בשמירת אישור תנאים." } });
  }
});

export default router;
