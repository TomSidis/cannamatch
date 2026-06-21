// ─────────────────────────────────────────────────────────────────────────────
//  קנאמאצ׳ — נתיבי AI  (routes/ai.js)
//  מצב: 100% מקומי — אפס קריאות Anthropic / LLM.
//  /api/health        — בדיקת שרת
//  /api/claude        — מושבת (מחזיר 503 בכוונה)
//  /api/zemach-chat   — "צמח" המקומי, מנוהל על ידי localBot.js
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { pool }   from '../db.js';
import {
  claudeRateLimit,
  verifySession,
} from '../security/claudeProxyShield.js';
import { handleZemachQuery, kAnonGuard } from '../lib/localBot.js';

const router = Router();

// ── GET /api/health ───────────────────────────────────────────────────────────
router.get('/health', (_req, res) => {
  res.json({ ok: true, mode: 'local', llm: false, version: '2.0.0-local' });
});

// ── POST /api/claude — intentionally disabled ─────────────────────────────────
// The Anthropic proxy has been replaced with the local deterministic engine.
// Returning 503 so existing clients get a clear, debuggable response instead
// of a silent hang.
router.post('/claude', claudeRateLimit, verifySession, (_req, res) => {
  res.status(503).json({
    error: {
      message:
        'הצ\'אט מופעל במצב מקומי (Local Mode). ' +
        'קריאות ישירות ל-Anthropic מושבתות לחלוטין. ' +
        'השתמש ב-POST /api/zemach-chat במקום.',
      code: 'LOCAL_MODE_ACTIVE',
    },
  });
});

// ── POST /api/zemach-chat — Zemach assistant (public; auth is optional)
router.post('/zemach-chat', claudeRateLimit, async (req, res) => {
  // Optional auth — bot serves ALL users; session only enriches the DNA profile
  let _userId = null;
  try {
    await new Promise((resolve, reject) =>
      verifySession(req, res, (err) => (err ? reject(err) : resolve()))
    );
    _userId = req.userId;
  } catch { /* unauthenticated is fine */ }

  // image: { data: base64string, type: 'image/jpeg' } — optional, for vision queries
  const { message, history = [], image } = req.body;

  if ((!message || !message.trim()) && !image?.data) {
    return res.status(400).json({ error: { message: 'חסרה הודעה.' } });
  }

  // ── Load user DNA profile (only when authenticated) ───────────────────────
  let profile   = null;
  let inventory = [];

  if (_userId) {
    try {
      const { rows: [profRow] } = await pool.query(
        `SELECT profile FROM user_dna_profiles WHERE user_id = $1`,
        [_userId],
      );
      profile = profRow?.profile || null;
    } catch (err) {
      console.warn('zemach-chat: profile lookup failed —', err.message);
    }
  }

  // ── Load live inventory (top 60 in-stock batches) ─────────────────────────
  try {
    const { rows } = await pool.query(
      `SELECT s.name, b.category, b.product_type, b.price, b.in_stock,
              ph.name AS pharmacy_name
       FROM batches b
       JOIN strains s ON s.id = b.strain_id
       LEFT JOIN pharmacies ph ON ph.id = b.pharmacy_id
       WHERE b.in_stock = TRUE
       ORDER BY b.created_at DESC
       LIMIT 60`,
    );
    inventory = rows;
  } catch (err) {
    console.warn('zemach-chat: inventory lookup failed —', err.message);
  }

  // ── Route through local bot engine ────────────────────────────────────────
  try {
    const result = await handleZemachQuery(message, profile, inventory, image || null);
    return res.json({
      reply:          result.reply,
      citations:      result.citations || [],
      local_fallback: result.local_fallback ?? true,
      intent:         result.intent,
    });
  } catch (err) {
    console.error('zemach-chat: localBot error —', err.message);
    return res.status(500).json({
      error: { message: 'שגיאה פנימית בעוזר המקומי.' },
    });
  }
});

// ── GET /api/community-stats — k-anonymity enforced ──────────────────────────
// Returns community data ONLY when n_reports >= 20 (k-anonymity guarantee).
router.get('/community-stats', verifySession, async (req, res) => {
  const { strain_id, indication_id } = req.query;
  if (!strain_id) {
    return res.status(400).json({ error: { message: 'חסר strain_id.' } });
  }

  try {
    const { rows: [row] } = await pool.query(
      `SELECT strain_id, indication_id, avg_score, helped_pct, n_reports,
              indication_note, updated_at
       FROM community_stats
       WHERE strain_id = $1
         AND ($2::text IS NULL OR indication_id = $2)
       ORDER BY updated_at DESC
       LIMIT 1`,
      [strain_id, indication_id || null],
    );

    const safe = kAnonGuard(row);         // null if n_reports < 20
    return res.json(safe ?? null);
  } catch (err) {
    console.warn('community-stats: DB error —', err.message);
    return res.json(null);
  }
});

export default router;
