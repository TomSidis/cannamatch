// ─────────────────────────────────────────────────────────────────────────────
//  קנאמאצ׳ — נתיבי שרת  (routes/ai.js)
//  /api/health          — בדיקת שרת
//  /api/community-stats — נתוני קהילה (k-anonymity)
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { pool }   from '../db.js';
import { verifySession } from '../security/claudeProxyShield.js';
import { kAnonGuard } from '../lib/localBot.js';

const router = Router();

// ── GET /api/health ───────────────────────────────────────────────────────────
router.get('/health', (_req, res) => {
  res.json({ ok: true, mode: 'local', llm: false, version: '2.0.0-local' });
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
