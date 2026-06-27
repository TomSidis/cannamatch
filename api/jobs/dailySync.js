/**
 * dailySync.js — 09:00 Asia/Jerusalem daily sync job.
 *
 * Scheduled in api/server.js via node-cron:
 *   cron.schedule('0 9 * * *', () => runDailySync(pool), { timezone: 'Asia/Jerusalem' });
 *
 * Steps:
 *   1. Refresh pharmacy list from MOH → DB → fallback chain
 *   2. Enrich hours from Google Places (if GOOGLE_PLACES_KEY is set)
 */

import { syncPharmacies, getPharmacies } from '../lib/pharmacySync.js';
import { fetchPlaceHours }               from '../lib/googlePlaces.js';

const PLACES_KEY       = process.env.GOOGLE_PLACES_KEY;
const MAX_PLACES_CALLS = 10; // stay within free-tier quota per run

export async function runDailySync(pool) {
  const t0 = Date.now();
  console.log('[daily] 09:00 sync starting…');

  // ── 1. Refresh pharmacy list ─────────────────────────────────────────────
  try {
    const { data, source } = await syncPharmacies(pool);
    console.log(`[daily] pharmacies synced: ${data.length} entries from "${source}"`);

    // ── 2. Google Places hours enrichment (optional) ──────────────────────
    if (PLACES_KEY) {
      const needHours = data.filter(p => !p.hours_weekdays && !p.hours_friday).slice(0, MAX_PLACES_CALLS);
      console.log(`[daily] enriching hours for ${needHours.length} pharmacies via Google Places…`);
      for (const p of needHours) {
        const hours = await fetchPlaceHours(p.name, p.city, PLACES_KEY);
        if (hours) {
          // Persist to DB if available
          try {
            await pool.query(
              `UPDATE pharmacies SET hours_weekdays=$1, hours_friday=$2, hours_saturday=$3 WHERE id=$4`,
              [hours.hours_weekdays, hours.hours_friday, hours.hours_saturday, p.id],
            );
            console.log(`[daily]   ✓ ${p.name} (${p.city}): ${hours.hours_weekdays || '?'}`);
          } catch { /* DB might not be running — non-fatal */ }
        }
      }
    } else {
      console.log('[daily] GOOGLE_PLACES_KEY not set — skipping hours enrichment');
      console.log('[daily]   → add GOOGLE_PLACES_KEY=AIzaSy… to .env to enable real hours');
    }
  } catch (err) {
    console.error('[daily] sync error:', err.message);
  }

  console.log(`[daily] done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
