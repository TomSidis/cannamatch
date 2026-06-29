/**
 * seedCatalog.js — Migrate israeli-pharmacy-catalog.js into genetics_node + product_sku.
 *
 * Facts migrate; fabricated chemistry does not:
 *   gConf "verified" (20)  → terpene_rank populated (declared rank order), terpene_source='declared_rank'
 *   gConf "grower"  (129)  → terpene_rank empty,  terpene_source='community_inferred'
 *   gConf "unverified" (147) → same as grower
 *
 * Does NOT write to grow_batch — catalog batch numbers are product labels, not COA
 * grow-batch identifiers (batch "26001" maps to 7 different genetics; not a real batch).
 * Scraper populates grow_batch from real COA data.
 *
 * Run: node api/db/seeds/seedCatalog.js
 */

import { pool }                                                       from '../../db.js';
import { normalizeName, resolveCanonicalName }                        from '../../lib/normalization.js';
import { PHARMARY_STRAINS, PHARMARY_STRAINS_2,
         PHARMARY_STRAINS_3, PHARMARY_STRAINS_4 }                    from '../../../src/data/israeli-pharmacy-catalog.js';

// ── helpers ───────────────────────────────────────────────────────────────────

const GROW_MAP = {
  'חממה':   'greenhouse',
  'אינדור': 'indoor',
  'חוץ':    'outdoor',
};

function toSlug(str = '') {
  return str.toLowerCase()
    .replace(/[()×]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function parseCat(cat = '') {
  const m = cat.match(/T(\d+)\/C(\d+)/i);
  return m ? { thc_pct: +m[1], cbd_pct: +m[2] } : { thc_pct: null, cbd_pct: null };
}

// Returns sorted terpene names (desc by pct) for gConf=verified entries only.
// Post-varyTerps values are fine here — we store rank order, not exact pct.
function terpeneRank(entry) {
  const conf = entry.gConf || 'unverified';
  if (conf !== 'verified') return [];
  const terps = entry.terps || {};
  return Object.entries(terps)
    .sort(([, a], [, b]) => b - a)
    .map(([name]) => name);
}

// ── main ──────────────────────────────────────────────────────────────────────

async function seed() {
  const all = [
    ...PHARMARY_STRAINS,
    ...PHARMARY_STRAINS_2,
    ...PHARMARY_STRAINS_3,
    ...PHARMARY_STRAINS_4,
  ];

  console.log(`[seed] ${all.length} catalog entries loaded`);

  // Deduplicate genetics by slug before inserting
  const geneticsMap = new Map(); // slug → first entry with this genetics
  for (const e of all) {
    const slug = toSlug(e.genetics || e.name);
    if (!geneticsMap.has(slug)) geneticsMap.set(slug, e);
    else {
      // Prefer higher-confidence entry for the same genetics
      const existing = geneticsMap.get(slug);
      const rank = { verified: 2, grower: 1, unverified: 0 };
      if ((rank[e.gConf] ?? 0) > (rank[existing.gConf] ?? 0)) {
        geneticsMap.set(slug, e);
      }
    }
  }

  let gNodeInserted = 0, gNodeSkipped = 0;
  let skuInserted   = 0, skuUpdated   = 0;
  let verifiedTerps = 0, blankTerps   = 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── 1. genetics_node ─────────────────────────────────────────────────────
    for (const [slug, e] of geneticsMap) {
      const conf      = e.gConf || 'unverified';
      const aliases   = [];
      if (e.name && e.name !== e.genetics) aliases.push(e.name);
      if (e.en   && e.en   !== e.genetics) aliases.push(e.en);

      const priorSource = conf === 'verified' ? 'derived'
                        : conf === 'grower'   ? 'expert'
                        : 'placeholder';
      const priorConf   = conf === 'verified' ? 0.40
                        : conf === 'grower'   ? 0.15
                        : 0.00;
      const topTerps    = terpeneRank(e); // non-empty only for verified

      const res = await client.query(
        `INSERT INTO genetics_node
           (id, display_name, aliases, node_type, prior_source, prior_conf,
            top_terpenes, notes)
         VALUES ($1, $2, $3, 'hybrid', $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE
           SET aliases      = CASE WHEN EXCLUDED.prior_conf > genetics_node.prior_conf
                                   THEN EXCLUDED.aliases      ELSE genetics_node.aliases END,
               prior_source = CASE WHEN EXCLUDED.prior_conf > genetics_node.prior_conf
                                   THEN EXCLUDED.prior_source ELSE genetics_node.prior_source END,
               prior_conf   = GREATEST(EXCLUDED.prior_conf, genetics_node.prior_conf),
               top_terpenes = CASE WHEN EXCLUDED.prior_conf > genetics_node.prior_conf
                                   THEN EXCLUDED.top_terpenes ELSE genetics_node.top_terpenes END,
               notes        = COALESCE(genetics_node.notes, EXCLUDED.notes),
               updated_at   = now()
         RETURNING (xmax = 0) AS inserted`,
        [slug, e.genetics || e.name, aliases, priorSource, priorConf, topTerps,
         e.lineage || null],
      );
      if (res.rows[0]?.inserted) gNodeInserted++;
      else gNodeSkipped++;
    }

    console.log(`[seed] genetics_node: ${gNodeInserted} inserted, ${gNodeSkipped} already existed`);

    // ── 2. product_sku ───────────────────────────────────────────────────────
    for (const e of all) {
      const conf          = e.gConf || 'unverified';
      const { canonical } = resolveCanonicalName(e.name || '');
      const batchId       = (e.batch || 'unknown').toString().trim() || 'unknown';
      const geneticsSlug  = toSlug(e.genetics || e.name);
      const { thc_pct, cbd_pct } = parseCat(e.cat);
      const rank          = terpeneRank(e);
      const terpSrc       = conf === 'verified' ? 'declared_rank' : 'community_inferred';
      const cultivMethod  = GROW_MAP[e.grow] ?? null;

      if (rank.length > 0) verifiedTerps++;
      else blankTerps++;

      const res = await client.query(
        `INSERT INTO product_sku
           (commercial_name, normalized_name, batch_id, genetics_id,
            grower, marketer, brand, category,
            terpene_rank, terpene_source,
            en_name, country, lineage_text, legacy_type,
            price_ils, orig_price_ils, pharmacies, forms,
            historical_rating, n_historical_reviews,
            match_confidence, match_method, status)
         VALUES
           ($1,$2,$3,$4,
            $5,$6,$7,$8,
            $9,$10,
            $11,$12,$13,$14,
            $15,$16,$17,$18,
            $19,$20,
            $21,$22,'active')
         ON CONFLICT (normalized_name, batch_id) DO UPDATE
           SET grower              = COALESCE(EXCLUDED.grower,    product_sku.grower),
               marketer            = COALESCE(EXCLUDED.marketer,  product_sku.marketer),
               category            = COALESCE(EXCLUDED.category,  product_sku.category),
               terpene_rank        = CASE WHEN array_length(EXCLUDED.terpene_rank, 1) > 0
                                          THEN EXCLUDED.terpene_rank
                                          ELSE product_sku.terpene_rank END,
               terpene_source      = CASE WHEN EXCLUDED.terpene_source = 'declared_rank'
                                          THEN 'declared_rank'
                                          ELSE product_sku.terpene_source END,
               price_ils           = COALESCE(EXCLUDED.price_ils,          product_sku.price_ils),
               orig_price_ils      = COALESCE(EXCLUDED.orig_price_ils,     product_sku.orig_price_ils),
               pharmacies          = EXCLUDED.pharmacies,
               historical_rating   = COALESCE(EXCLUDED.historical_rating,  product_sku.historical_rating),
               n_historical_reviews = GREATEST(EXCLUDED.n_historical_reviews, product_sku.n_historical_reviews),
               updated_at          = now()
         RETURNING (xmax = 0) AS inserted`,
        [
          e.name,   canonical,  batchId,   geneticsSlug,
          e.grower, e.brand,    e.brand,   e.cat,
          rank,     terpSrc,
          e.en,     e.country,  e.lineage, e.kind,
          e.price ?? null,  e.origPrice || null,
          e.pharmacies || [], e.forms || [],
          e.rating  ?? null,  Math.round(e.nReviews || 0),
          conf === 'verified' ? 0.9 : conf === 'grower' ? 0.5 : 0.0,
          conf === 'verified' ? 'declared_lineage' : 'fuzzy',
        ],
      );
      if (res.rows[0]?.inserted) skuInserted++;
      else skuUpdated++;
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[seed] ROLLBACK —', err.message);
    process.exit(1);
  } finally {
    client.release();
  }

  console.log(`[seed] product_sku : ${skuInserted} inserted, ${skuUpdated} upserted`);
  console.log(`[seed] terpene_rank: ${verifiedTerps} with data, ${blankTerps} blanked (unverified/grower)`);

  // ── 3. Verification counts ────────────────────────────────────────────────
  const { rows: [counts] } = await pool.query(`
    SELECT
      (SELECT count(*) FROM genetics_node)::int                                    AS genetics_nodes,
      (SELECT count(*) FROM product_sku)::int                                      AS skus,
      (SELECT count(*) FROM product_sku WHERE array_length(terpene_rank,1) > 0)::int AS skus_with_terps,
      (SELECT count(*) FROM product_sku WHERE terpene_rank = '{}')::int           AS skus_blank_terps,
      (SELECT count(DISTINCT batch_id) FROM product_sku WHERE batch_id != 'unknown')::int AS known_batches,
      (SELECT count(*) FROM product_sku WHERE batch_id = 'unknown')::int          AS unknown_batch_skus
  `);
  console.log('\n[seed] DB counts after migration:');
  console.table(counts);

  // Sample: 3 Hebrew-name products to verify encoding
  const { rows: samples } = await pool.query(`
    SELECT commercial_name, normalized_name, grower, legacy_type, batch_id,
           terpene_rank, terpene_source, price_ils
    FROM product_sku
    WHERE commercial_name IN ('פינק שרב', 'קי ליימז פאנץ''', 'בי אן סי מיני')
    ORDER BY commercial_name
  `);
  console.log('\n[seed] Sample rows (Hebrew encoding check):');
  console.table(samples);

  await pool.end();
}

seed().catch(err => { console.error(err); process.exit(1); });
