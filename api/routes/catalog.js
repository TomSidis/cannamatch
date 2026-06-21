import { Router }  from "express";
import { pool }     from "../db.js";
import { DEFAULT_DNA } from "../constants.js";
import { computeOpenStatus, ISRAELI_PHARMACY_FALLBACK } from "../lib/pharmacyHours.js";
import { scoreAll }      from "../../src/lib/scoringEngine.js";
import { TERPENES, REASONS } from "../../src/data/strainsConfig.js";

const router = Router();

// ── Shared helpers ────────────────────────────────────────────

function mapRowToScoringEngineStrain(row) {
  return {
    id:                 row.strain_id || row.id,
    name:               row.strain_name || row.name,
    cat:                row.category || "T22/C4",
    terps:              row.terpene_dist || {},
    effects:            row.target_indications || [],
    type:               row.product_type || "flower",
    genetics:           row.genetics,
    lineage:            row.lineage,
    genetic_confidence: row.genetic_confidence || row.confidence,
  };
}

function mapDnaToScoringAnswers(dna, overrideCats = null) {
  return {
    cats:      overrideCats || ["T22/C4","T18/C3","T15/C3","T12/C12","T10/C10","T10/C2","T3/C15","T3/C12"],
    reasons:   dna.indications || [],
    flavors:   Object.keys(dna.target_terpenes || {}),
    helped: [], notHelped: [], current: [],
  };
}

// ── GET /api/strains ──────────────────────────────────────────
// Fuzzy search via pg_trgm GIN index.
// Optional ?user_id ranks results with the unified scoreAll engine.
router.get("/strains", async (req, res) => {
  const { type, q, user_id, limit = 100 } = req.query;
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
      const ranked = scoreAll(ans, {}, { strains: rows.map(mapRowToScoringEngineStrain), terpenes: TERPENES, reasons: REASONS });
      return res.json(ranked);
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


export default router;
