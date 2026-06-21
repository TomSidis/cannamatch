/**
 * api/routes/pharmacies.js — Mounted at /api/pharmacies (before catalogRouter)
 *
 * Auth model:
 *   GET /          — public
 *   POST /sync     — public, rate-limited
 *   GET  /search   — public, rate-limited
 *   GET  /:id/menu — public
 *   POST /:id/verify — public, rate-limited (no auth — crowdsource requires zero friction)
 *   POST /alert    — requires auth (alerts stored per-user)
 *   GET  /alerts   — requires auth; returns [] gracefully on 401
 *   DELETE /alerts/:id — requires auth
 */

import { Router }  from 'express';
import { pool }    from '../db.js';
import { claudeRateLimit, verifySession } from '../security/claudeProxyShield.js';
import { computeOpenStatus }              from '../lib/pharmacyHours.js';
import {
  getPharmacies, syncPharmacies, enrichCoords, getCacheInfo,
} from '../lib/pharmacySync.js';
import { webSearch } from '../lib/webSearch.js';

const router = Router();

// ── In-memory fallback stores ─────────────────────────────────────────────────
const VERIFY_MEM = new Map(); // batchId → { yes, no, last_at }
const ALERT_MEM  = new Map(); // `${userId}:${strainId}:${pharmacyId}` → alertObj

// ── DB table initialisation (CREATE TABLE IF NOT EXISTS, non-blocking) ─────────
let _tablesReady = false;
async function ensureTables() {
  if (_tablesReady) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pharmacy_stock_reports (
        id         BIGSERIAL PRIMARY KEY,
        batch_id   TEXT NOT NULL,
        user_id    TEXT,
        answer     TEXT NOT NULL CHECK (answer IN ('yes','no')),
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS psr_batch ON pharmacy_stock_reports (batch_id);

      CREATE TABLE IF NOT EXISTS pharmacy_stock_alerts (
        id            BIGSERIAL PRIMARY KEY,
        user_id       TEXT NOT NULL,
        pharmacy_id   TEXT NOT NULL,
        strain_id     TEXT NOT NULL,
        strain_name   TEXT,
        pharmacy_name TEXT,
        created_at    TIMESTAMPTZ DEFAULT now(),
        UNIQUE (user_id, strain_id, pharmacy_id)
      );
    `);
    _tablesReady = true;
  } catch (err) {
    console.warn('pharmacies: table init failed — using in-memory fallback:', err.message);
  }
}
// Fire-and-forget on startup (does not block first request)
ensureTables().catch(() => {});

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getVerifyCounts(batchIds) {
  if (!batchIds.length) return {};
  try {
    const { rows } = await pool.query(
      `SELECT batch_id, answer, COUNT(*)::int AS cnt
       FROM pharmacy_stock_reports
       WHERE batch_id = ANY($1::text[])
       GROUP BY batch_id, answer`,
      [batchIds],
    );
    const out = {};
    for (const { batch_id, answer, cnt } of rows) {
      out[batch_id] ??= { yes: 0, no: 0 };
      out[batch_id][answer] = cnt;
    }
    return out;
  } catch {
    const out = {};
    for (const id of batchIds) {
      if (VERIFY_MEM.has(id)) out[id] = VERIFY_MEM.get(id);
    }
    return out;
  }
}

async function recordVerify(batchId, userId, answer) {
  try {
    await pool.query(
      `INSERT INTO pharmacy_stock_reports (batch_id, user_id, answer) VALUES ($1,$2,$3)`,
      [batchId, userId || null, answer],
    );
  } catch {
    const cur = VERIFY_MEM.get(batchId) || { yes: 0, no: 0, last_at: 0 };
    VERIFY_MEM.set(batchId, { ...cur, [answer]: cur[answer] + 1, last_at: Date.now() });
  }
}

// ── GET / — pharmacy list (enriched with coords + open status + stock count) ──
router.get('/', async (_req, res) => {
  try {
    const data      = await getPharmacies(pool);
    const cacheInfo = getCacheInfo();
    res.json({
      pharmacies: data,
      meta: {
        count:      data.length,
        open_count: data.filter(p => p.is_open).length,
        synced_at:  cacheInfo.synced_at,
        source:     cacheInfo.source,
      },
    });
  } catch (err) {
    console.error('GET /api/pharmacies:', err.message);
    res.status(500).json({ error: { message: 'שגיאת שרת.' } });
  }
});

// ── GET /search — multi-modal search with external fallback ───────────────────
// Searches local DB → if < 2 hits, augments with free web search (webSearch.js)
router.get('/search', claudeRateLimit, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ pharmacies: [], web_results: [] });

  // Local search
  const all     = await getPharmacies(pool);
  const ql      = q.toLowerCase();
  const local   = all.filter(p =>
    [p.name, p.city, p.address, p.chain].some(f => f?.toLowerCase().includes(ql))
  );

  // External fallback if insufficient local results
  let webResults = [];
  if (local.length < 2) {
    try {
      webResults = await webSearch(`${q} בית מרקחת קנאביס רפואי ישראל`);
    } catch { /* non-fatal */ }
  }

  res.json({
    pharmacies:  local,
    web_results: webResults.slice(0, 4),
  });
});

// ── POST /sync — rate-limited MOH refresh ────────────────────────────────────
router.post('/sync', claudeRateLimit, async (_req, res) => {
  const info = getCacheInfo();
  if (!info.stale) {
    return res.json({
      cached: true, synced_at: info.synced_at, source: info.source, count: info.count,
    });
  }
  try {
    const r = await syncPharmacies(pool);
    res.json({ cached: false, synced_at: r.synced_at, source: r.source, count: r.data.length });
  } catch (err) {
    res.status(500).json({ error: { message: 'שגיאת סנכרון.' } });
  }
});

// ── GET /alerts — auth required; graceful 401 not thrown ─────────────────────
router.get('/alerts', async (req, res) => {
  // Try to authenticate without blocking the request on failure
  let userId = null;
  try {
    await new Promise((resolve, reject) => {
      verifySession(req, res, (err) => (err ? reject(err) : resolve()));
    });
    userId = req.userId;
  } catch {
    return res.json([]); // unauthenticated → empty list (not 401)
  }

  try {
    await ensureTables();
    const { rows } = await pool.query(
      `SELECT id, pharmacy_id, strain_id, strain_name, pharmacy_name, created_at
       FROM pharmacy_stock_alerts WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    );
    return res.json(rows);
  } catch {
    const prefix = `${userId}:`;
    return res.json(
      [...ALERT_MEM.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v)
    );
  }
});

// ── GET /:id/menu — full live menu, public ────────────────────────────────────
router.get('/:id/menu', async (req, res) => {
  const { id }  = req.params;
  const limit   = Math.min(Number(req.query.limit) || 150, 500);

  // Load pharmacy metadata
  let pharmacy = null;
  try {
    const { rows: [ph] } = await pool.query(
      `SELECT id, name, city, address, phone, website_url, maps_url,
              hours_weekdays, hours_friday, hours_saturday, delivery
       FROM pharmacies WHERE id = $1`,
      [id],
    );
    if (ph) pharmacy = { ...enrichCoords(ph), ...computeOpenStatus(ph) };
  } catch {}

  if (!pharmacy) {
    const cached = await getPharmacies(pool);
    pharmacy = cached.find(p => String(p.id) === String(id)) || null;
  }

  // Load stock
  let stock = [];
  try {
    const { rows } = await pool.query(
      `SELECT b.id AS batch_id, b.strain_id,
              s.name AS strain_name, s.genetics, s.lineage, s.kind,
              b.category, b.product_type, b.price, b.in_stock,
              b.data_confidence, b.terpene_source, b.batch_number, b.batch_year,
              b.created_at AS last_updated
       FROM batches b
       JOIN strains s ON s.id = b.strain_id
       WHERE b.pharmacy_id = $1
       ORDER BY b.in_stock DESC, b.category, b.price ASC NULLS LAST
       LIMIT $2`,
      [id, limit],
    );
    stock = rows;
  } catch (err) {
    console.warn(`pharmacy-menu DB [${id}]:`, err.message);
    // Return empty menu with pharmacy meta (so UI shows "no inventory in DB" not an error)
  }

  // Attach community verification counts
  const batchIds  = stock.map(r => String(r.batch_id));
  const verifyCts = await getVerifyCounts(batchIds);

  // Group by category, sort T-numbers descending
  const byCategory = {};
  for (const row of stock) {
    const cat = row.category || 'אחר';
    (byCategory[cat] ??= []).push({
      ...row,
      verification: verifyCts[String(row.batch_id)] || { yes: 0, no: 0 },
    });
  }
  const categories = Object.entries(byCategory)
    .sort(([a], [b]) => {
      const tA = parseInt(a.match(/T(\d+)/)?.[1] ?? '0');
      const tB = parseInt(b.match(/T(\d+)/)?.[1] ?? '0');
      return tB - tA;
    })
    .map(([category, items]) => ({ category, items }));

  const cacheInfo = getCacheInfo();
  res.json({
    pharmacy,
    categories,
    total_in_stock: stock.filter(r => r.in_stock).length,
    total_items:    stock.length,
    synced_at:      cacheInfo.synced_at,
  });
});

// ── POST /:id/verify — PUBLIC crowdsource verification (no auth, rate-limited) ─
router.post('/:id/verify', claudeRateLimit, async (req, res) => {
  const { batch_id, answer } = req.body;
  if (!batch_id || !['yes', 'no'].includes(answer)) {
    return res.status(400).json({ error: { message: 'batch_id + answer (yes/no) required.' } });
  }

  // Try to get userId from auth header if present (optional)
  let userId = null;
  try {
    await new Promise((resolve, reject) => {
      verifySession(req, res, (err) => (err ? reject(err) : resolve()));
    });
    userId = req.userId;
  } catch { /* unauth is OK for verify */ }

  await recordVerify(String(batch_id), userId, answer);

  const counts = await getVerifyCounts([String(batch_id)]);
  res.json({
    batch_id, answer,
    counts:           counts[String(batch_id)] || { yes: 0, no: 0 },
    community_points: 1,
  });
});

// ── POST /alert — create stock alert (auth required) ─────────────────────────
router.post('/alert', async (req, res) => {
  // Try auth; if unavailable, store in-memory only
  let userId = null;
  try {
    await new Promise((resolve, reject) => {
      verifySession(req, res, (err) => (err ? reject(err) : resolve()));
    });
    userId = req.userId;
  } catch {
    // Unauthenticated: acknowledge without persisting server-side
    return res.status(200).json({ ok: true, persisted: false });
  }

  const { pharmacy_id, strain_id, strain_name, pharmacy_name } = req.body;
  if (!pharmacy_id || !strain_id) {
    return res.status(400).json({ error: { message: 'pharmacy_id + strain_id required.' } });
  }

  const alertObj = {
    id:           `${userId}-${strain_id}-${pharmacy_id}`,
    user_id:      userId,
    pharmacy_id, strain_id,
    strain_name:  strain_name  || '',
    pharmacy_name: pharmacy_name || '',
    created_at:   new Date().toISOString(),
  };

  try {
    await ensureTables();
    await pool.query(
      `INSERT INTO pharmacy_stock_alerts (user_id,pharmacy_id,strain_id,strain_name,pharmacy_name)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id, strain_id, pharmacy_id) DO NOTHING`,
      [userId, pharmacy_id, strain_id, strain_name || '', pharmacy_name || ''],
    );
  } catch {
    ALERT_MEM.set(`${userId}:${strain_id}:${pharmacy_id}`, alertObj);
  }

  res.status(201).json({ ok: true, persisted: true, alert: alertObj });
});

// ── DELETE /alerts/:alertId — cancel alert ────────────────────────────────────
router.delete('/alerts/:alertId', verifySession, async (req, res) => {
  const { alertId } = req.params;
  try {
    await pool.query(
      `DELETE FROM pharmacy_stock_alerts WHERE id::text = $1 AND user_id = $2`,
      [alertId, req.userId],
    );
  } catch {
    ALERT_MEM.delete(alertId);
  }
  res.json({ ok: true });
});

export default router;
