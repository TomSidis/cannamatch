import { Router }  from "express";
import { pool }     from "../db.js";
import { DEFAULT_DNA } from "../constants.js";
import { computeOpenStatus, ISRAELI_PHARMACY_FALLBACK } from "../lib/pharmacyHours.js";
import { bridgeScore } from "../../src/engine/legacyBridge.ts";
import { LICENSED_CATEGORIES, DEFAULT_CATEGORY, PEEK_WINDOW_ENABLED } from "../../src/lib/categoryConfig.js";

const router = Router();

// ── Shared helpers ────────────────────────────────────────────

function mapRowToScoringEngineStrain(row) {
  return {
    id:                 row.strain_id || row.id,
    name:               row.strain_name || row.name,
    cat:                row.category || DEFAULT_CATEGORY,
    terps:              row.terpene_dist || {},
    effects:            row.target_indications || [],
    type:               row.product_type || "flower",
    genetics:           row.genetics,
    lineage:            row.lineage,
    genetic_confidence: row.genetic_confidence || row.confidence,
  };
}

function mapDnaToScoringAnswers(dna, overrideCats = null) {
  // Personal license categories from onboarding OCR / manual entry.
  // Falls back to the full global list only when the user has no license data yet.
  const userCats = dna.categories && dna.categories.length > 0
    ? dna.categories
    : LICENSED_CATEGORIES;
  return {
    cats:         overrideCats || userCats,
    reasons:      dna.indications      || [],
    killSwitches: dna.blocked_triggers || [],
  };
}

// Sanitize query params: strip HTML/script chars, cap length
function sanitizeParam(val, maxLen = 200) {
  if (typeof val !== "string") return "";
  return val.replace(/[<>"'`]/g, "").slice(0, maxLen).trim();
}

// ── GET /api/strains ──────────────────────────────────────────
// Fuzzy search via pg_trgm GIN index.
// Optional ?user_id ranks results with the unified scoreAll engine.
router.get("/strains", async (req, res) => {
  const q       = sanitizeParam(req.query.q);
  const type    = sanitizeParam(req.query.type, 50);
  const user_id = sanitizeParam(req.query.user_id, 50);
  const limit   = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
  const params = [];

  let sql = `
    SELECT s.id, s.name, s.name_en, s.genetics, s.lineage, s.kind,
           s.terpene_dist, s.target_indications, s.genetic_confidence,
           b.category, b.product_type, b.price, b.embedding
    FROM strains s
    LEFT JOIN LATERAL (
      SELECT category, product_type, price, embedding
      FROM batches
      WHERE strain_id = s.id AND in_stock = TRUE
      ORDER BY price ASC LIMIT 1
    ) b ON TRUE
    WHERE 1=1`;

  if (type) {
    params.push(type);
    sql += ` AND b.product_type = $${params.length}`;
  }

  if (q) {
    params.push(q);
    sql += ` AND (
               s.name     % $${params.length}
            OR s.genetics % $${params.length}
            OR s.name_en  % $${params.length}
            OR $${params.length} = ANY(s.aka)
           )
           ORDER BY GREATEST(
             similarity(s.name,                    $${params.length}),
             similarity(COALESCE(s.genetics, ''),  $${params.length}),
             similarity(COALESCE(s.name_en,  ''),  $${params.length})
           ) DESC`;
  }

  params.push(Number(limit));
  sql += ` LIMIT $${params.length}`;

  try {
    const { rows } = await pool.query(sql, params);

    if (user_id && rows.length) {
      const { rows: [profRow] } = await pool.query(
        `SELECT profile FROM user_dna_profiles WHERE user_id = $1`, [user_id],
      );
      const dna = profRow?.profile || DEFAULT_DNA;
      const ans = mapDnaToScoringAnswers(dna);

      const allScored = rows.map(mapRowToScoringEngineStrain).map(s => {
        const r = bridgeScore(s, ans);
        return { ...s, match: r.matchPct, confidence: r.confidence,
                 reasonHuman: r.reasonHuman, topLayer: r.topLayer };
      });

      const ranked = allScored
        .filter(s => s.match > 0)  // drop license-denied (0%) rows
        .sort((a, b) => b.match - a.match || b.confidence - a.confidence);

      // Peek window — count products outside the user's licensed categories.
      // 🚧 REGULATORY BLOCKER: PEEK_WINDOW_ENABLED=false until Tom gets legal sign-off
      // that showing out-of-license counts is permitted under Israeli cannabis regulations.
      const outOfLicense = PEEK_WINDOW_ENABLED
        ? allScored.filter(s => s.match === 0 && ans.cats.length > 0 && !ans.cats.includes(s.cat))
        : [];
      const peek = {
        enabled:    PEEK_WINDOW_ENABLED,
        count:      outOfLicense.length,
        categories: [...new Set(outOfLicense.map(s => s.cat))].sort(),
      };

      return res.json({ results: ranked, peek });
    }

    res.json(rows);
  } catch (err) {
    console.error("strains error:", err);
    res.status(500).json({ error: { message: "שגיאת DB בשליפת זנים" } });
  }
});

// ── GET /api/inventory ────────────────────────────────────────
router.get("/inventory", async (req, res) => {
  const { pharmacy_id, category, strain_id, limit = 200 } = req.query;

  // Validate limit is a safe integer
  const safeLimit = Math.min(Number(limit) || 200, 1000);

  const params = [];
  let sql = `
    SELECT b.id, b.strain_id, s.name AS strain_name, s.genetics, s.lineage,
           b.category, b.product_type, b.price, b.in_stock, b.confidence_score,
           ph.id AS pharmacy_id, ph.name AS pharmacy_name, ph.city,
           ph.website_url, ph.maps_url,
           ph.hours_weekdays, ph.hours_friday, ph.hours_saturday
    FROM batches b
    JOIN strains s ON s.id = b.strain_id
    LEFT JOIN pharmacies ph ON ph.id = b.pharmacy_id
    WHERE b.in_stock = TRUE`;

  if (pharmacy_id) { params.push(pharmacy_id); sql += ` AND ph.id = $${params.length}`; }
  if (category)    { params.push(category);    sql += ` AND b.category = $${params.length}`; }
  if (strain_id)   { params.push(strain_id);   sql += ` AND b.strain_id = $${params.length}`; }

  params.push(safeLimit);
  sql += ` ORDER BY b.created_at DESC LIMIT $${params.length}`;

  try {
    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error("inventory error:", err);
    res.status(500).json({ error: { message: "שגיאת שרת בשליפת מלאי" } });
  }
});

// ── GET /api/pharmacies ───────────────────────────────────────
router.get("/pharmacies", async (_req, res) => {
  let pharmacies;
  try {
    const { rows } = await pool.query(
      `SELECT id, name, city, delivery, address, phone, website_url, maps_url,
              hours_weekdays, hours_friday, hours_saturday
       FROM pharmacies ORDER BY name`,
    );
    pharmacies = rows.length ? rows : ISRAELI_PHARMACY_FALLBACK;
  } catch (err) {
    console.error("pharmacies DB error — falling back to static list:", err.message);
    pharmacies = ISRAELI_PHARMACY_FALLBACK;
  }
  res.json(pharmacies.map((p) => ({ ...p, ...computeOpenStatus(p) })));
});

// ── GET /api/pharmacy-stock/:pharmacyId ───────────────────────
router.get("/pharmacy-stock/:pharmacyId", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  try {
    const { rows } = await pool.query(
      `SELECT b.id, b.strain_id, s.name AS strain_name, s.genetics, s.lineage,
              b.category, b.product_type, b.price, b.in_stock,
              b.data_confidence, b.terpene_source, b.batch_number, b.batch_year,
              b.expiry, b.cannabinoids_measured, b.cannabinoids_source,
              b.created_at AS last_updated
       FROM batches b
       JOIN strains s ON s.id = b.strain_id
       WHERE b.pharmacy_id = $1
       ORDER BY b.in_stock DESC, b.price ASC NULLS LAST
       LIMIT $2`,
      [req.params.pharmacyId, limit],
    );
    res.json({ pharmacy_id: req.params.pharmacyId, count: rows.length, stock: rows });
  } catch (err) {
    console.error("pharmacy-stock error:", err);
    res.status(500).json({ error: { message: "שגיאת שרת בשליפת מלאי בית מרקחת" } });
  }
});

// ── GET /api/community-stats — social proof aggregates ────────
// Returns report counts and avg efficacy per strain (k-anonymity: min 3 reports).
// Zero-latency empty-state when no data — never throws a 5xx.
router.get("/community-stats", async (req, res) => {
  const { strain_id } = req.query;
  try {
    const where  = strain_id ? `WHERE strain_id::text = $1` : ``;
    const params = strain_id ? [strain_id] : [];
    const { rows: [stat] } = await pool.query(
      `SELECT
         COUNT(*)::int                                           AS total_reports,
         ROUND(AVG(efficacy)::numeric, 1)                       AS avg_efficacy,
         COUNT(*) FILTER (WHERE efficacy >= 4)::int             AS high_rating_count,
         COUNT(*) FILTER (WHERE anxiety_triggered = TRUE)::int  AS anxiety_count
       FROM user_reviews ${where}`,
      params,
    );
    // Enforce k-anonymity — suppress until there are at least 3 reports
    const total = stat?.total_reports || 0;
    if (total < 3) return res.json({ total_reports: 0, avg_efficacy: null, high_rating_count: 0 });
    res.json(stat);
  } catch (err) {
    console.error("community-stats error:", err.message);
    res.json({ total_reports: 0, avg_efficacy: null, high_rating_count: 0 });
  }
});


// ── POST /api/pending-scan — user-scan triggered ingestion (Task 1a) ─────────
// Names that passed isPlausibleProductName in the decoder land here for admin review.
// Same dedup logic as the daily scheduler; never auto-promotes — always pending.
router.post("/pending-scan", async (req, res) => {
  const { names = [] } = req.body;
  if (!Array.isArray(names) || names.length === 0) return res.json({ added: 0 });

  const normName = (s) =>
    (s || '').toLowerCase().replace(/[\s‏‎]+/g, ' ').replace(/['"'׳״.\-–—_]/g, '').trim();

  let added = 0;
  for (const { name, cat } of names) {
    if (!name) continue;
    const normed = normName(name);
    if (!normed || normed.length < 3) continue;
    try {
      const { rowCount } = await pool.query(
        `INSERT INTO pending_product (commercial_name, normalized_name, source_id, raw_context)
         VALUES ($1,$2,'user-scan',$3)
         ON CONFLICT (normalized_name) DO NOTHING`,
        [name, normed, cat || null],
      );
      added += rowCount;
    } catch (err) {
      if (err.code !== '42P01') console.warn('[pending-scan]', err.message);
    }
  }
  return res.json({ added });
});

// ── GET /api/new-on-market — recently detected commercial names ────────────────
// Returns latest product_sku entries (auto-approved) + pending count for admin badge.
// Gracefully returns empty array if migration 015 hasn't run yet.
router.get("/new-on-market", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
  try {
    const { rows } = await pool.query(
      `SELECT
         p.id, p.commercial_name, p.genetics_id, p.match_confidence,
         p.match_method, p.grower, p.marketer, p.brand, p.category,
         p.terpene_rank, p.first_seen_at, p.source_id,
         g.display_name AS genetics_display,
         s.display_name AS source_display
       FROM product_sku p
       LEFT JOIN genetics_node g ON g.id = p.genetics_id
       LEFT JOIN sku_source    s ON s.id = p.source_id
       WHERE p.status = 'active'
       ORDER BY p.first_seen_at DESC
       LIMIT $1`,
      [limit],
    );
    res.json({ items: rows });
  } catch (err) {
    // Table doesn't exist yet (migration pending) — return empty
    if (err.code === '42P01') return res.json({ items: [] });
    console.error('new-on-market error:', err.message);
    res.json({ items: [] });
  }
});

export default router;
