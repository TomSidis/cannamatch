/**
 * batchIngestor.js — Core batch ingestion logic.
 *
 * Flow for each manufacturer:
 *   1. Fetch batches_url (with timeout + retry)
 *   2. parseCOA → array of ParsedCOA
 *   3. Diff: keep only batchNos not already in grow_batch
 *   4. For each new batch: resolveGenetics (DB lookup) → upsert grow_batch
 *   5. On any per-manufacturer error: log + continue (never abort the run)
 *
 * The manual-upload path (admin POST /upload-coa) calls ingestBatch() directly
 * and bypasses steps 1-3 (content is already supplied by the upload).
 */

import { parseCOA }              from './coa/parseCOA.js';
import { checkManufacturerUrl } from './ssrfGuard.js';

const FETCH_TIMEOUT_MS = 15_000;
const MAX_RETRIES      = 2;
const RETRY_DELAY_MS   = 2_000;

// ── Genetics resolution via DB (backend-side, no TS engine needed) ─────────────

/**
 * Resolve a genetics display name to a genetics_node.id by querying the DB.
 * Returns null if not found (caller logs + continues with genetics_id=null).
 *
 * @param {import('pg').Pool} pool
 * @param {string|undefined} displayName
 * @returns {Promise<string|null>}
 */
async function resolveGeneticsId(pool, displayName) {
  if (!displayName || !pool) return null;
  try {
    const { rows } = await pool.query(
      `SELECT id FROM genetics_node
        WHERE lower(display_name) = lower($1)
           OR lower($1::text) = ANY(SELECT lower(a) FROM unnest(aliases) a)
        LIMIT 1`,
      [displayName.trim()],
    );
    return rows[0]?.id ?? null;
  } catch {
    return null; // DB might not have the genetics_node table yet
  }
}

// ── Fetch with timeout + retry ─────────────────────────────────────────────────

async function fetchWithRetry(url, attempt = 0) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'CannaMatch-BatchBot/1.0 (regulatory COA scraper; contact: admin@cannamatch.co.il)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8',
      },
    });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return await res.text();
  } catch (err) {
    clearTimeout(timer);
    if (attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
      return fetchWithRetry(url, attempt + 1);
    }
    throw err;
  }
}

// ── Diff: which batchNos are new? ──────────────────────────────────────────────

async function getExistingBatchNos(pool, manufacturerId) {
  if (!pool) return new Set();
  try {
    const { rows } = await pool.query(
      `SELECT id FROM grow_batch WHERE manufacturer_id = $1`,
      [manufacturerId],
    );
    return new Set(rows.map(r => r.id));
  } catch {
    return new Set(); // table might not exist yet
  }
}

// ── Upsert a single grow_batch row ────────────────────────────────────────────

async function upsertGrowBatch(pool, parsed, manufacturerId, geneticsId) {
  if (!pool) return;
  await pool.query(
    `INSERT INTO grow_batch
       (id, genetics_id, cultivator, cultivation_method, irradiation, grow_season,
        thc_pct, cbd_pct, terpenes, provenance, coa_url, coa_fetched_at,
        manufacturer_id, raw_coa_text)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now(),$12,$13)
     ON CONFLICT (id) DO UPDATE
       SET genetics_id       = COALESCE(EXCLUDED.genetics_id, grow_batch.genetics_id),
           terpenes          = EXCLUDED.terpenes,
           provenance        = EXCLUDED.provenance,
           coa_fetched_at    = now(),
           updated_at        = now()`,
    [
      parsed.batchNo,
      geneticsId,
      parsed.cultivator,
      parsed.cultivationMethod ?? null,
      parsed.irradiation ?? null,
      parsed.growSeason ?? null,
      parsed.thcPct ?? null,
      parsed.cbdPct ?? null,
      JSON.stringify(parsed.terpenes),
      parsed.provenance,
      parsed.coaUrl ?? null,
      manufacturerId,
      parsed.rawText ?? null,
    ],
  );

  // Cultivation method inheritance: when this batch has no terpenes and no
  // explicit cultivation_method, inherit from the most-recent sibling batch
  // (same genetics_id) that had measured terpene data.  Marks the row with
  // cultivation_inherited=TRUE so the scorer can apply a confidence penalty.
  const hasTerpenes = parsed.terpenes && Object.keys(parsed.terpenes).length > 0;
  if (!hasTerpenes && !parsed.cultivationMethod && geneticsId) {
    try {
      const { rows } = await pool.query(
        `SELECT cultivation_method FROM grow_batch
          WHERE genetics_id = $1
            AND id != $2
            AND cultivation_method IS NOT NULL
            AND terpenes != '{}'::jsonb
          ORDER BY created_at DESC
          LIMIT 1`,
        [geneticsId, parsed.batchNo],
      );
      if (rows[0]?.cultivation_method) {
        await pool.query(
          `UPDATE grow_batch
              SET cultivation_method   = $1,
                  cultivation_inherited = TRUE,
                  updated_at           = now()
            WHERE id = $2`,
          [rows[0].cultivation_method, parsed.batchNo],
        );
      }
    } catch { /* non-fatal — sibling table may not exist yet */ }
  }
}

// ── Update manufacturer scrape status ─────────────────────────────────────────

async function updateManufacturerStatus(pool, id, status, errorMsg = null) {
  if (!pool) return;
  try {
    await pool.query(
      `UPDATE manufacturer_registry
          SET scrape_status = $1, last_scraped = now(), last_error = $2, updated_at = now()
        WHERE id = $3`,
      [status, errorMsg, id],
    );
  } catch { /* non-fatal */ }
}

// ── Per-manufacturer ingestion ─────────────────────────────────────────────────

/**
 * Run ingestion for a single manufacturer.
 * Returns a stats object; NEVER throws (errors are returned in the stats).
 *
 * @param {import('pg').Pool|null} pool
 * @param {{ id, display_name, batches_url, parser_type }} manufacturer
 * @returns {Promise<{ id, newBatches, measured, declared, error }>}
 */
export async function ingestManufacturer(pool, manufacturer) {
  const { id, display_name, batches_url, parser_type } = manufacturer;
  const stats = { id, displayName: display_name, newBatches: 0, measured: 0, declared: 0, error: null };

  // SSRF allowlist check — manufacturer domain must be in the approved list.
  // Unknown domains are marked 'needs_review' and skipped without fetching.
  // To approve a new domain: add it to ALLOWED_MANUFACTURER_HOSTS in ssrfGuard.js.
  const urlCheck = checkManufacturerUrl(batches_url);
  if (!urlCheck.allowed) {
    stats.error = `SSRF: hostname "${urlCheck.hostname}" is not in ALLOWED_MANUFACTURER_HOSTS (${urlCheck.reason}) — add to api/lib/ssrfGuard.js to approve`;
    await updateManufacturerStatus(pool, id, 'needs_review', stats.error);
    console.warn(`[ingest:${id}] ⚠ skipped — domain needs review: ${urlCheck.hostname}`);
    return stats;
  }

  try {
    // 1. Fetch
    let content;
    try {
      content = await fetchWithRetry(batches_url);
    } catch (fetchErr) {
      stats.error = `Fetch failed: ${fetchErr.message}`;
      await updateManufacturerStatus(pool, id, 'failed', stats.error);
      return stats;
    }

    // 2. Parse
    const { batches, warnings } = parseCOA(id, content, batches_url);
    if (warnings.length > 0) {
      console.log(`[ingest:${id}] warnings: ${warnings.join('; ')}`);
    }

    if (batches.length === 0) {
      stats.error = 'Parser returned 0 batches — site structure may have changed';
      await updateManufacturerStatus(pool, id, 'failed', stats.error);
      return stats;
    }

    // 3. Diff
    const existing = await getExistingBatchNos(pool, id);
    const newOnes  = batches.filter(b => !existing.has(b.batchNo));

    // 4. Upsert new batches
    for (const parsed of newOnes) {
      const geneticsId = await resolveGeneticsId(pool, parsed.genetics);
      await upsertGrowBatch(pool, parsed, id, geneticsId);

      stats.newBatches++;
      if (parsed.provenance === 'measured') stats.measured++;
      else stats.declared++;
    }

    await updateManufacturerStatus(pool, id, 'ok');
    console.log(`[ingest:${id}] ✓ ${stats.newBatches} new batches (${stats.measured} measured)`);
  } catch (err) {
    stats.error = err.message;
    await updateManufacturerStatus(pool, id, 'failed', err.message);
    console.error(`[ingest:${id}] ✗ unexpected error:`, err.message);
  }

  return stats;
}

/**
 * Ingest a single pre-parsed COA (used by the manual-upload endpoint).
 * Returns true on success.
 *
 * @param {import('pg').Pool|null} pool
 * @param {import('./coa/types.js').ParsedCOA} parsed
 * @param {string} manufacturerId
 * @returns {Promise<boolean>}
 */
export async function ingestBatch(pool, parsed, manufacturerId) {
  const geneticsId = await resolveGeneticsId(pool, parsed.genetics);
  await upsertGrowBatch(pool, parsed, manufacturerId, geneticsId);
  return true;
}

/**
 * Run full ingestion for all manufacturers.
 * Each manufacturer failure is isolated — the run always continues.
 *
 * @param {import('pg').Pool|null} pool
 * @returns {Promise<{ totalNew, measured, declared, failed: string[], details: object[] }>}
 */
export async function runFullIngestion(pool) {
  let manufacturers = [];

  // Load from DB if available; otherwise use inline fallback list
  if (pool) {
    try {
      const { rows } = await pool.query(
        `SELECT id, display_name, batches_url, parser_type
           FROM manufacturer_registry
          WHERE scrape_status != 'manual_only'
          ORDER BY id`,
      );
      manufacturers = rows;
    } catch {
      console.warn('[ingest] manufacturer_registry table not found — using fallback list');
    }
  }

  if (manufacturers.length === 0) {
    // Minimal fallback (no DB) — just Seach for smoke testing
    manufacturers = [
      { id: 'seach', display_name: 'Seach', batches_url: 'https://seach.co.il/products/batches/', parser_type: 'html' },
    ];
  }

  const results = [];
  for (const mfr of manufacturers) {
    const stats = await ingestManufacturer(pool, mfr);
    results.push(stats);
  }

  const totalNew  = results.reduce((s, r) => s + r.newBatches, 0);
  const measured  = results.reduce((s, r) => s + r.measured, 0);
  const declared  = results.reduce((s, r) => s + r.declared, 0);
  const failed    = results.filter(r => r.error).map(r => r.displayName);

  // Write run log to DB
  if (pool) {
    try {
      await pool.query(
        `INSERT INTO scrape_run_log (new_batches, measured_count, declared_count, failed_manufacturers, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [totalNew, measured, declared, failed, JSON.stringify(results)],
      );
    } catch { /* non-fatal */ }
  }

  return { totalNew, measured, declared, failed, details: results };
}
