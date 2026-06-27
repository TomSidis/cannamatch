/**
 * batchIngestJob.js — Daily 08:00 Asia/Jerusalem batch ingestion job.
 *
 * Wired in api/server.js:
 *   cron.schedule('0 8 * * *', () => runBatchIngestJob(pool), { timezone: 'Asia/Jerusalem' });
 *
 * What it does:
 *   1. Fetches COA pages from each manufacturer in manufacturer_registry
 *   2. Parses batches (using manufacturer-specific parsers)
 *   3. Diffs vs yesterday → only new batches stored
 *   4. Writes a scrape_run_log row with counts + failures
 *   5. Per-manufacturer failures never abort the run
 *
 * Morning report: query scrape_run_log for yesterday's entry:
 *   GET /api/admin/ingest-report (in admin.js)
 */

import { runFullIngestion } from '../lib/batchIngestor.js';

/**
 * @param {import('pg').Pool|null} pool
 */
export async function runBatchIngestJob(pool) {
  const t0 = Date.now();
  console.log('[batch] 08:00 COA ingestion starting…');

  try {
    const { totalNew, measured, declared, failed, details } = await runFullIngestion(pool);

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[batch] done in ${elapsed}s — ${totalNew} new batches (${measured} measured, ${declared} declared)`);

    if (failed.length > 0) {
      console.warn(`[batch] ${failed.length} manufacturer(s) failed:`, failed.join(', '));
      console.warn('[batch] → these appear in the morning report for manual upload');
    } else {
      console.log('[batch] all manufacturers scraped successfully');
    }

    return { totalNew, measured, declared, failed };
  } catch (err) {
    // Top-level catch: should never happen since ingestManufacturer never throws
    console.error('[batch] unexpected top-level error:', err.message);
    return { totalNew: 0, measured: 0, declared: 0, failed: ['unknown'], error: err.message };
  }
}
