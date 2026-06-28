/**
 * strainDetectionJob.js — Daily 07:00 Asia/Jerusalem commercial strain detection.
 *
 * Wired in api/server.js:
 *   cron.schedule('0 7 * * *', () => runStrainDetectionJob(pool), { timezone: 'Asia/Jerusalem' });
 *
 * Pipeline:
 *   1. For each active sku_source: fetch + parse commercial names
 *   2. Normalize name → dedup against product_sku + pending_product
 *   3. New names: attempt auto-link to genetics_node (exact → fuzzy)
 *   4. Write to pending_product (admin reviews before product_sku promotion)
 *   5. Auto-promote when match_confidence ≥ 0.90 (exact or declared lineage)
 *   6. Log run to sku_scrape_log
 */

import {
  scrapeCannabizNew,
  scrapeCannabizCatalog,
  scrapeEasyCannabis,
} from '../lib/cannabizScraper.js';

// ── Name normalisation (mirrors menuDecoder.js norm()) ────────────────────────
function normName(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[\s‏‎]+/g, ' ')
    .replace(/['"'׳״.\-–—_]/g, '')
    .trim();
}

// ── Genetics auto-resolution ───────────────────────────────────────────────────
/**
 * Try to link a commercial name to genetics_node.
 * Returns { genetics_id, confidence, method } — genetics_id may be null.
 */
async function autoResolveGenetics(pool, name) {
  if (!pool) return { genetics_id: null, confidence: 0, method: null };

  const normed = normName(name);

  try {
    // 1. Exact match on display_name or alias
    const exact = await pool.query(
      `SELECT id FROM genetics_node
        WHERE lower(display_name) = $1
           OR lower($1) = ANY(SELECT lower(a) FROM unnest(aliases) a)
        LIMIT 1`,
      [normed],
    );
    if (exact.rows[0]) {
      return { genetics_id: exact.rows[0].id, confidence: 1.0, method: 'exact' };
    }

    // 2. Trigram similarity (pg_trgm) — requires extension
    const fuzzy = await pool.query(
      `SELECT id, similarity(lower(display_name), $1) AS sim
        FROM genetics_node
        WHERE similarity(lower(display_name), $1) > 0.55
        ORDER BY sim DESC
        LIMIT 1`,
      [normed],
    );
    if (fuzzy.rows[0]) {
      const conf = Math.round(fuzzy.rows[0].sim * 100) / 100;
      return { genetics_id: fuzzy.rows[0].id, confidence: conf, method: 'fuzzy' };
    }
  } catch (err) {
    // pg_trgm may not be installed; degrade silently
    console.warn('[strain-detect] genetics resolve error:', err.message);
  }

  return { genetics_id: null, confidence: 0, method: null };
}

// ── Source dispatcher ──────────────────────────────────────────────────────────
async function scrapeSource(source) {
  const { id, url } = source;
  switch (id) {
    case 'cannabiz-new':
      return scrapeCannabizNew(url);
    case 'cannabiz-catalog':
      return scrapeCannabizCatalog(url);
    case 'easy-cannabis':
      return scrapeEasyCannabis(url);
    default:
      console.warn(`[strain-detect] no parser for source "${id}" — skipping`);
      return [];
  }
}

// ── Main job ──────────────────────────────────────────────────────────────────
export async function runStrainDetectionJob(pool) {
  const t0 = Date.now();
  console.log('[strain-detect] 07:00 commercial strain detection starting…');

  if (!pool) {
    console.warn('[strain-detect] no DB pool — skipping (dry-run mode)');
    return;
  }

  // Load active sources
  let sources;
  try {
    const { rows } = await pool.query(
      `SELECT id, display_name, url, priority, parser_type
         FROM sku_source WHERE active = true ORDER BY priority`,
    );
    sources = rows;
  } catch (err) {
    console.error('[strain-detect] cannot load sku_source (migration 015 not run?):', err.message);
    return;
  }

  if (sources.length === 0) {
    console.warn('[strain-detect] no active sources configured');
    return;
  }

  // Load existing normalized names to diff against
  let knownNames;
  try {
    const { rows } = await pool.query(
      `SELECT normalized_name FROM product_sku
       UNION
       SELECT normalized_name FROM pending_product`,
    );
    knownNames = new Set(rows.map(r => r.normalized_name));
  } catch (err) {
    console.error('[strain-detect] cannot load known names:', err.message);
    return;
  }

  let totalSeen = 0, totalNewPending = 0, totalAutoApproved = 0;

  for (const source of sources) {
    console.log(`[strain-detect] scraping "${source.display_name}"…`);
    let names = [];
    let scrapeError = null;

    try {
      names = await scrapeSource(source);
      await pool.query(
        `UPDATE sku_source SET last_scraped = now(), last_error = NULL WHERE id = $1`,
        [source.id],
      );
    } catch (err) {
      scrapeError = err.message;
      console.warn(`[strain-detect] source "${source.id}" failed: ${err.message}`);
      await pool.query(
        `UPDATE sku_source SET last_scraped = now(), last_error = $1 WHERE id = $2`,
        [err.message, source.id],
      );
    }

    totalSeen += names.length;

    // Process new names
    for (const name of names) {
      const normed = normName(name);
      if (!normed || knownNames.has(normed)) continue;

      knownNames.add(normed); // prevent duplicate within this run

      // Auto-resolve genetics
      const { genetics_id, confidence, method } = await autoResolveGenetics(pool, name);

      if (confidence >= 0.90) {
        // High-confidence match → write directly to product_sku
        try {
          await pool.query(
            `INSERT INTO product_sku
               (commercial_name, normalized_name, batch_id, genetics_id, match_confidence,
                match_method, source_id, status)
             VALUES ($1,$2,'unknown',$3,$4,$5,$6,'active')
             ON CONFLICT (normalized_name, batch_id, COALESCE(product_format, '')) DO NOTHING`,
            [name, normed, genetics_id, confidence, method, source.id],
          );
          totalAutoApproved++;
          console.log(`[strain-detect]   ✓ auto-approved: ${name} → ${genetics_id} (${(confidence*100).toFixed(0)}%)`);
        } catch (e) {
          console.warn(`[strain-detect]   auto-approve insert failed for "${name}": ${e.message}`);
        }
      } else {
        // Lower confidence → pending queue for admin review
        try {
          await pool.query(
            `INSERT INTO pending_product
               (commercial_name, normalized_name, batch_id, source_id,
                auto_genetics_id, auto_confidence, auto_method)
             VALUES ($1,$2,'unknown',$3,$4,$5,$6)
             ON CONFLICT (normalized_name, batch_id, COALESCE(product_format, '')) DO NOTHING`,
            [name, normed, source.id, genetics_id, confidence, method],
          );
          totalNewPending++;
          console.log(`[strain-detect]   ↻ pending: ${name} (conf=${(confidence*100).toFixed(0)}%)`);
        } catch (e) {
          console.warn(`[strain-detect]   pending insert failed for "${name}": ${e.message}`);
        }
      }
    }

    if (scrapeError) {
      try {
        await pool.query(
          `INSERT INTO sku_scrape_log (source_id, total_seen, error) VALUES ($1, $2, $3)`,
          [source.id, 0, scrapeError],
        );
      } catch {}
    }
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `[strain-detect] done in ${elapsed}s — ${totalSeen} names seen, ` +
    `${totalAutoApproved} auto-approved, ${totalNewPending} pending review`,
  );

  // Summary log row
  try {
    await pool.query(
      `INSERT INTO sku_scrape_log
         (new_pending, new_approved, total_seen)
       VALUES ($1, $2, $3)`,
      [totalNewPending, totalAutoApproved, totalSeen],
    );
  } catch {}

  return { totalSeen, totalAutoApproved, totalNewPending };
}
