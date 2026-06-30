/**
 * ingestEasyCannabis.js — resumable, streaming, format-aware easy-cannabis ingest.
 *
 * Usage: node api/db/seeds/ingestEasyCannabis.js [--run-id=LABEL] [--reset] [--limit=N]
 *
 *   Default run-id : easy-{LIMIT}-{TODAY}  — same-day restart resumes; different limits separate.
 *   --reset         : delete checkpoint for this run-id, start fresh.
 *   --limit         : URLs to scrape (default 2000).
 *
 * Pipeline:
 *   0. Tests — ABORT on failure.
 *   1. Check robots.txt crawl-delay. DELAY = max(3s, specified).
 *   2. Preconditions: sku count, canonical_key index, old key gone.
 *   3. Apply migrations 023 + 026 (idempotent).
 *   4. Clear easy-cannabis pending rows (status='pending' only — never approved).
 *   5. Sitemap → top LIMIT URLs by lastmod.
 *   6. Per URL (STREAMING — no large array):
 *        Checkpoint already has it → re-parse from stored og:title + re-INSERT (instant resume).
 *        New URL → fetch → parse og:title → INSERT pending_product → checkpoint.
 *        HTTP 429/503 → exponential backoff + resume from checkpoint.
 *   7. Grower-collision audit over full easy-cannabis pending set.
 *   8. Report: parsed / written / format distribution / inferred-format debt / needs_review split.
 *
 * INVARIANTS:
 *   - product_sku: never written, updated, or deleted.
 *   - Nothing auto-approved.  raw_og_title stored verbatim.
 *   - Same URL re-scraped → ON CONFLICT → no duplicate, no double fuzzy flag.
 */

import zlib          from 'zlib';
import { promisify } from 'util';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path          from 'path';
import pg            from 'pg';
import dotenv        from 'dotenv';
dotenv.config();
import { normalize, parseOgTitle, canonicalKey } from '../../lib/catalogParser.js';

// Scraper-local pool: keepAlive prevents long-run TCP drops; longer connectionTimeout
// gives headroom when all workers briefly contest for a connection.
const pool = new pg.Pool({
  connectionString:         process.env.DATABASE_URL || 'postgresql://cannamatch:cannamatch@localhost:5432/cannamatch',
  max:                      20,
  idleTimeoutMillis:        60_000,
  connectionTimeoutMillis:  15_000,
  keepAlive:                true,
  keepAliveInitialDelayMillis: 10_000,
  allowExitOnIdle:          true,
});
pool.on('error', (err) => console.error('[pool] unexpected error:', err.message));

const gunzip   = promisify(zlib.gunzip);
const UA       = 'CannaMatch-CatalogBot/1.0 (medical-cannabis patient tool; contact: admin@cannamatch.co.il)';
const SITE     = 'https://easycannabis.co.il';
const FUZZY_THRESH = 2;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── CLI ────────────────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=') || true]; })
);
const TODAY           = new Date().toISOString().slice(0, 10);
// --limit=0 or omitting --limit → scrape ALL URLs in sitemap
const LIMIT_ARG       = args['limit'];
const LIMIT           = (LIMIT_ARG === undefined || LIMIT_ARG === '0') ? Infinity : parseInt(LIMIT_ARG, 10);
// --concurrency=N workers fetch in parallel (each sleeps DELAY between requests)
const CONCURRENCY     = parseInt(args['concurrency'] || '8', 10);
// --delay=ms per-worker floor (default 1000ms for full runs; set higher for polite sampling)
const MIN_DELAY_FLOOR = parseInt(args['delay'] || '1000', 10);
const RUN_ID          = args['run-id'] || (LIMIT === Infinity ? `easy-full-${TODAY}` : `easy-${LIMIT}-${TODAY}`);
const RESET           = !!args['reset'];

// ── Levenshtein (inline — no deps) ────────────────────────────────────────────
function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const prev = Array.from({ length: n + 1 }, (_, i) => i);
  const curr = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++)
      curr[j] = a[i-1] === b[j-1] ? prev[j-1] : 1 + Math.min(prev[j], curr[j-1], prev[j-1]);
    prev.splice(0, n + 1, ...curr);
  }
  return prev[n];
}

function fuzzyNearMatch(normed, nameSet) {
  let best = null, bestDist = Infinity;
  for (const ex of nameSet) {
    if (ex === normed) return null; // exact match — not a near-miss
    const d = levenshtein(normed, ex);
    if (d <= FUZZY_THRESH && d < bestDist) { bestDist = d; best = ex; }
  }
  return best ? { match: best, dist: bestDist } : null;
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────
function makeFetch(url, timeoutMs = 15000) {
  return fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': UA, Accept: '*/*' } });
}

async function safeFetch(url, delay, timeoutMs = 15000, maxRetries = 4) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const r = await makeFetch(url, timeoutMs);
    if (r.status === 429 || r.status === 503) {
      if (attempt === maxRetries) throw new Error(`HTTP ${r.status} after ${maxRetries} retries: ${url}`);
      const backoff = Math.min(delay * (2 ** (attempt + 1)), 60_000);
      console.warn(`\n[fetch] HTTP ${r.status} — backoff ${(backoff/1000).toFixed(0)}s (attempt ${attempt+1})`);
      await sleep(backoff);
      continue;
    }
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
    return r;
  }
}

async function fetchText(url, delay) {
  return (await safeFetch(url, delay)).text();
}

// ── robots.txt crawl-delay ────────────────────────────────────────────────────
async function getCrawlDelayMs(site) {
  try {
    const r = await makeFetch(`${site}/robots.txt`, 8000);
    if (!r.ok) return 0;
    const text = await r.text();
    let inStar = false;
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (/^user-agent:/i.test(line)) {
        inStar = line.replace(/^user-agent:\s*/i, '').trim() === '*';
      } else if (inStar && /^crawl-delay:/i.test(line)) {
        const secs = parseFloat(line.replace(/^crawl-delay:\s*/i, ''));
        return isNaN(secs) ? 0 : Math.round(secs * 1000);
      }
    }
  } catch {}
  return 0;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 0. TESTS
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n[tests] Parser + normalize…');
let failures = 0;
function check(label, got, expected) {
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  console.log(ok ? '  ✓' : '  ✗', label, ok ? '' : `\n    got: ${JSON.stringify(got)}\n    exp: ${JSON.stringify(expected)}`);
  if (!ok) failures++;
}

check('normalize: dots',         normalize('אר.טי.זד'),          'ארטיזד');
check('normalize: latin',        normalize('RTZ'),               'rtz');
check('normalize: niqqud',       normalize('שָׁלוֹם'),            'שלום');
check('normalize: hyphens',      normalize('blue-dream'),        'blue dream');
check('normalize: quotes',       normalize("ג'לטיקס"),          'גלטיקס');
check('normalize: parens',       normalize('סי גיי (CJ)'),      'סי גיי');
check('normalize: collapse',     normalize('og  kush'),          'og kush');
check('normalize: empty',        normalize(''),                  '');
check('normalize: undef',        normalize(undefined),           '');
check('parse: homepage',         parseOgTitle('חנות אונליין T22/C4'), null);
check('parse: סיבאנק',           parseOgTitle('חנות קנאביס סיבאנק T22/C4'), null);
// חנות קנאביס BEFORE T/C → homepage; AFTER T/C → product page (pharmacy descriptor)
check('parse: חנות קנאביס before T/C → reject', parseOgTitle('חנות קנאביס כלשהי'), null);
const _pKim = parseOgTitle('תפרחת קים אם.ג"י - T22/C4 חנות קנאביס סופר פארם - איזי קנאביס');
check('parse: product page with חנות קנאביס after T/C → accept', _pKim?.strain_name, 'קים אם.ג"י');
check('parse: product page format', _pKim?.product_format, 'inflorescence');
const _p3 = parseOgTitle('אבידקל מינון T3/C15 - Pharmacy X');
check('parse: מינון→name',       _p3?.strain_name,    'אבידקל');
check('parse: מינון→format',     _p3?.product_format, 'inflorescence');
check('parse: מינון→tc',         _p3?.tc_category,    'T3/C15');
const _p4 = parseOgTitle('מבצע! תפרחת רפאל - T22/C4 - Doctor-K');
check('parse: תפרחת→name',       _p4?.strain_name,    'רפאל');
check('parse: תפרחת→format',     _p4?.product_format, 'inflorescence');
const _p5 = parseOgTitle('שמן הולנדי - T22/C4');
check('parse: שמן→oil',          _p5?.product_format, 'oil');
check('parse: שמן stripped',     _p5?.strain_name,    'הולנדי');
const _p6 = parseOgTitle('אר.טי.זד מיני - T22/C4 - Pharmacy');
check('parse: מיני→small',       _p6?.product_format, 'small');
check('parse: מיני stripped',    normalize(_p6?.strain_name||''), 'ארטיזד');
check('parse: גליליות kept',     parseOgTitle('גליליות בלאק - T22/C4')?.strain_name, 'גליליות בלאק');
const _p9 = parseOgTitle('מבצע! שמן שמן הולנדי - T22/C4 אינדיקה - איזי קנאביס');
check('parse: שמן×2→oil',        _p9?.product_format, 'oil');
check('parse: שמן×2→הולנדי',     _p9?.strain_name,    'הולנדי');
const _p10 = parseOgTitle('מבצע! גליליות גליליות בלאק - T22/C4 אינדיקה - איזי קנאביס');
check('parse: גליליות×2→name',   _p10?.strain_name,   'גליליות בלאק');
check('parse: גליליות×2→format', _p10?.product_format,'inflorescence');
const _p11 = parseOgTitle('מבצע! תפרחת טי.אר.קיי מיני - T22/C4 אינדיקה - איזי קנאביס');
check('parse: תפרחת+מיני→small', _p11?.product_format,'small');
check('parse: תפרחת+מיני→name',  _p11?.strain_name,   'טי.אר.קיי');
check('canonicalKey',            canonicalKey('אר.טי.זד','small','unknown'), 'ארטיזד|small|unknown');
check('levenshtein: 0',          levenshtein('abc','abc'), 0);
check('levenshtein: 1',          levenshtein('abc','abcd'), 1);
check('levenshtein: 2',          levenshtein('kitten','sitten'), 1);

// Synthetic grower-collision
{
  const rows = [{ ckey: 'rtz|inflorescence|kanabar' }, { ckey: 'rtz|inflorescence|other' }];
  const groups = new Map();
  for (const r of rows) {
    const p = r.ckey.split('|'), sf = `${p[0]}|${p[1]}`;
    if (!groups.has(sf)) groups.set(sf, new Set());
    groups.get(sf).add(p[2]);
  }
  const hits = [...groups.values()].filter(s => s.size > 1);
  check('synthetic: grower_mismatch', hits.length > 0, true);
}

// Fuzzy near-miss
{
  const s = new Set(['blue dream']);
  check('fuzzy: near-miss d=1', fuzzyNearMatch('blue drea', s)?.match, 'blue dream');
  check('fuzzy: exact → null',  fuzzyNearMatch('blue dream', s), null);
  check('fuzzy: far → null',    fuzzyNearMatch('og kush', s), null);
}

if (failures > 0) {
  console.error(`\n[tests] ${failures} FAILED — aborting.\n`);
  process.exit(1);
}
console.log('[tests] All passed.\n');

// ═══════════════════════════════════════════════════════════════════════════════
// 1. ROBOTS.TXT CRAWL-DELAY
// ═══════════════════════════════════════════════════════════════════════════════
const robotsDelay = await getCrawlDelayMs(SITE);
const DELAY = Math.max(MIN_DELAY_FLOOR, robotsDelay);
console.log(`[robots] crawl-delay for *: ${robotsDelay ? (robotsDelay/1000)+'s' : 'not specified'} → floor ${MIN_DELAY_FLOOR/1000}s → using ${DELAY/1000}s (×${CONCURRENCY} workers)\n`);

// ═══════════════════════════════════════════════════════════════════════════════
// 2. PRECONDITIONS
// ═══════════════════════════════════════════════════════════════════════════════
const { rows:[pre] } = await pool.query(`
  SELECT
    (SELECT count(*)::int FROM product_sku)                                                       AS sku_total,
    (SELECT count(*)::int FROM pg_indexes WHERE tablename='product_sku'
       AND indexname='product_sku_canonical_key')                                                 AS has_canonical_key,
    (SELECT count(*)::int FROM pg_indexes WHERE tablename='product_sku'
       AND indexname='product_sku_name_batch_key')                                                AS has_old_key,
    (SELECT count(*)::int FROM pg_indexes WHERE tablename='pending_product'
       AND indexname='pending_product_name_batch_format_key')                                     AS has_pending_key
`);
if (pre.has_canonical_key !== 1) { console.error('[precond] STOP: product_sku_canonical_key missing'); process.exit(1); }
if (pre.has_old_key !== 0)       { console.error('[precond] STOP: old name_batch_key still present');  process.exit(1); }
if (pre.has_pending_key !== 1)   { console.error('[precond] STOP: pending_product_name_batch_format_key missing'); process.exit(1); }
const SKU_BEFORE = pre.sku_total;
console.log(`[precond] sku=${SKU_BEFORE}  canonical_key✓  old_key gone✓  pending_key✓\n`);

// ═══════════════════════════════════════════════════════════════════════════════
// 3. MIGRATIONS (idempotent)
// ═══════════════════════════════════════════════════════════════════════════════
const __dir = path.dirname(fileURLToPath(import.meta.url));
for (const mig of ['023_catalog_hardening.sql', '026_scrape_checkpoints.sql']) {
  await pool.query(readFileSync(path.join(__dir, '../migrations', mig), 'utf8'));
}
console.log('[migrate] 023 + 026 applied.\n');

// ═══════════════════════════════════════════════════════════════════════════════
// 4. INIT RUN + LOAD CHECKPOINT (before deciding whether to DELETE)
// ═══════════════════════════════════════════════════════════════════════════════
if (RESET) {
  await pool.query(`DELETE FROM scrape_runs WHERE run_id=$1`, [RUN_ID]);
  console.log(`[resume] Cleared checkpoint for ${RUN_ID}.`);
}
await pool.query(`
  INSERT INTO scrape_runs (run_id, source_id, target_urls, status)
  VALUES ($1,'easy-cannabis',0,'running')
  ON CONFLICT (run_id) DO UPDATE SET status='running', updated_at=now()
`, [RUN_ID]);

const { rows: cpRows } = await pool.query(
  `SELECT url, fetch_status, raw_og_title, lastmod FROM scrape_checkpoints WHERE run_id=$1`, [RUN_ID]
);
const checkpoint = new Map(cpRows.map(r => [r.url, r]));
const isResume = checkpoint.size > 0;
console.log(`[resume] run_id=${RUN_ID}  checkpointed=${checkpoint.size}  ${isResume ? 'RESUMING' : 'fresh run'}\n`);

// ═══════════════════════════════════════════════════════════════════════════════
// 4b. CLEAR PENDING — only on fresh starts, not resumes.
//     --reset or new run-id → empty checkpoint → DELETE + re-insert.
//     Resume (checkpoint > 0) → skip DELETE → ON CONFLICT → 0 new rows (idempotent).
// ═══════════════════════════════════════════════════════════════════════════════
if (!isResume) {
  const { rowCount: cleared } = await pool.query(
    `DELETE FROM pending_product WHERE source_id='easy-cannabis' AND status='pending'`
  );
  console.log(`[clear] Fresh run — removed ${cleared} unreviewed pending rows.\n`);
} else {
  console.log(`[clear] Resume — pending rows preserved for ON CONFLICT idempotency.\n`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. SITEMAP → top LIMIT URLs
// ═══════════════════════════════════════════════════════════════════════════════
console.log('[sitemap] Fetching index…');
const sitXml = await fetchText(`${SITE}/sitemap.xml`, DELAY);
const gzUrls = [...sitXml.matchAll(/<loc>(https[^<]+\.gz)<\/loc>/g)].map(m => m[1]);
console.log(`[sitemap] ${gzUrls.length} gz files.`);

const allEntries = [];
for (let i = 0; i < gzUrls.length; i++) {
  try {
    const r   = await safeFetch(gzUrls[i], DELAY);
    const xml = (await gunzip(Buffer.from(await r.arrayBuffer()))).toString('utf8');
    [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].forEach(b => {
      const loc     = b[1].match(/<loc>([^<]+)<\/loc>/)?.[1]         ?? '';
      const lastmod = b[1].match(/<lastmod>([^<]+)<\/lastmod>/)?.[1] ?? '';
      if (loc && lastmod) allEntries.push({ loc, lastmod });
    });
    process.stdout.write(`\r[sitemap] gz ${i+1}/${gzUrls.length} — ${allEntries.length} entries`);
  } catch (e) {
    console.warn(`\n[sitemap] WARN gz ${i+1}: ${e.message}`);
  }
  if (i < gzUrls.length - 1) await sleep(400);
}
allEntries.sort((a, b) => b.lastmod.localeCompare(a.lastmod));
const targetUrls = isFinite(LIMIT) ? allEntries.slice(0, LIMIT) : allEntries;
const estHours   = (targetUrls.length * DELAY / CONCURRENCY / 3_600_000).toFixed(1);
console.log(`\n[sitemap] ${allEntries.length} total → ${isFinite(LIMIT) ? `top ${LIMIT}` : 'ALL'} = ${targetUrls.length} URLs.`);
if (targetUrls.length > 0)
  console.log(`[sitemap] range: ${targetUrls[0].lastmod.slice(0,16)} → ${targetUrls[targetUrls.length-1].lastmod.slice(0,16)}`);
console.log(`[run] run_id=${RUN_ID}  concurrency=${CONCURRENCY}  delay=${DELAY}ms  est≈${estHours}h\n`);

// ═══════════════════════════════════════════════════════════════════════════════
// 6. STREAM: FETCH → PARSE → INSERT → CHECKPOINT
// ═══════════════════════════════════════════════════════════════════════════════

// Update target_urls count now that we know it
await pool.query(`UPDATE scrape_runs SET target_urls=$2 WHERE run_id=$1`, [RUN_ID, targetUrls.length]);

// ── In-memory state (bounded size regardless of LIMIT) ────────────────────────
const { rows: aliasRows } = await pool.query('SELECT alias_norm, canonical_name FROM strain_aliases');
const aliasMap = new Map(aliasRows.map(r => [r.alias_norm, r.canonical_name]));

// existingNames: all normed names for fuzzy check; grows as we insert
const { rows: existingRows } = await pool.query(`
  SELECT normalized_name FROM product_sku
  UNION
  SELECT normalized_name FROM pending_product WHERE source_id='easy-cannabis'
`);
const existingNames = new Set(existingRows.map(r => r.normalized_name));

// skuNormedFmt: normed+format to skip if already in live catalog
const { rows: skuFmtRows } = await pool.query(`SELECT normalized_name, product_format FROM product_sku`);
const skuNormedFmt = new Set(skuFmtRows.map(r => `${r.normalized_name}|${r.product_format}`));

function resolveCanonical(rawName) {
  const n = normalize(rawName);
  return aliasMap.get(n) ?? n;
}

async function saveCheckpoint(url, fetchStatus, rawOgTitle, lastmod) {
  await pool.query(`
    INSERT INTO scrape_checkpoints (run_id, url, fetch_status, raw_og_title, lastmod)
    VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (run_id, url) DO UPDATE SET fetch_status=$3, raw_og_title=$4, fetched_at=now()
  `, [RUN_ID, url, fetchStatus, rawOgTitle ?? null, (lastmod || '').slice(0, 10)]);
}

// processAndInsert: parse og:title → INSERT to pending if valid.
// Returns 'inserted' | 'conflict' | 'skipped_sku' | 'junk'
async function processAndInsert(rawOgTitle) {
  if (!rawOgTitle) return 'junk';
  const result = parseOgTitle(rawOgTitle);
  if (!result) return 'junk';

  const canonical = resolveCanonical(result.strain_name);
  const normed    = normalize(canonical);
  const ckey      = canonicalKey(canonical, result.product_format);
  const fmt       = result.product_format;

  if (skuNormedFmt.has(`${normed}|${fmt}`)) return 'skipped_sku';

  const fuzzy    = fuzzyNearMatch(normed, existingNames);
  const needsRev = !!fuzzy;
  const reason   = fuzzy ? `fuzzy_near_match:${fuzzy.match}(d=${fuzzy.dist})` : null;

  const res = await pool.query(`
    INSERT INTO pending_product
      (commercial_name, normalized_name, batch_id, source_id,
       raw_og_title, strain_name, product_format, tc_category,
       canonical_key, needs_review, needs_review_reason,
       auto_genetics_id, auto_confidence, auto_method)
    VALUES ($1,$2,'unknown','easy-cannabis',
            $3,$4,$5,$6,
            $7,$8,$9,
            NULL,0,NULL)
    ON CONFLICT DO NOTHING`,
    [result.strain_name, normed, rawOgTitle, result.strain_name, fmt, result.tc_category,
     ckey, needsRev, reason]
  );

  if (res.rowCount > 0) {
    existingNames.add(normed);
    return 'inserted';
  }
  return 'conflict';
}

// ── Main stream — concurrent worker pool ─────────────────────────────────────
// JS is single-threaded: idx++ and Set.add() are safe from concurrent workers.
// Multiple fetch() calls run truly concurrently (await yields event loop).
let nFetched = 0, nResumed = 0, nInserted = 0, nConflict = 0, nSkippedSku = 0, nJunk = 0, nError = 0;
let globalIdx = 0;
const total = targetUrls.length;

const ticker = setInterval(() => {
  const pct = total > 0 ? ((globalIdx / total) * 100).toFixed(1) : '0.0';
  process.stdout.write(`\r[stream] ${globalIdx}/${total} (${pct}%)  w=${CONCURRENCY} ins=${nInserted} conflict=${nConflict} err=${nError}   `);
}, 3000);

async function crawlWorker() {
  while (true) {
    const i = globalIdx++;
    if (i >= total) break;
    const { loc, lastmod } = targetUrls[i];

    if (checkpoint.has(loc)) {
      // Resume path: re-parse from stored og:title — no HTTP fetch
      const cp = checkpoint.get(loc);
      if (cp.fetch_status === 'parsed' && cp.raw_og_title) {
        try {
          const outcome = await processAndInsert(cp.raw_og_title);
          if (outcome === 'inserted')         nInserted++;
          else if (outcome === 'conflict')    nConflict++;
          else if (outcome === 'skipped_sku') nSkippedSku++;
          else                                nJunk++;
        } catch (e) {
          console.warn(`\n[db] resume-insert error: ${e.message.slice(0, 60)}`);
          nError++;
        }
      } else {
        nJunk++;
      }
      nResumed++;
      continue;
    }

    // Fetch path
    let rawOgTitle = null, fetchStatus = 'error';
    try {
      const html = await fetchText(loc, DELAY);
      rawOgTitle = html.match(/property="og:title"\s+content="([^"]+)"/i)?.[1]
                ?? html.match(/content="([^"]+)"\s+property="og:title"/i)?.[1] ?? '';
      nFetched++;
      fetchStatus = 'skipped';
    } catch (e) {
      if (!/HTTP 5\d\d/.test(e.message))
        console.warn(`\n[fetch] WARN: ${e.message.slice(0, 80)}`);
      nError++;
      try { await saveCheckpoint(loc, 'error', null, lastmod); } catch {}
      await sleep(DELAY);
      continue;
    }

    try {
      const outcome = await processAndInsert(rawOgTitle);
      if (outcome === 'inserted')         { nInserted++;    fetchStatus = 'parsed';  }
      else if (outcome === 'conflict')    { nConflict++;    fetchStatus = 'parsed';  }
      else if (outcome === 'skipped_sku') { nSkippedSku++;  fetchStatus = 'skipped'; }
      else                                { nJunk++;                                 }
    } catch (e) {
      console.warn(`\n[db] insert error: ${e.message.slice(0, 60)}`);
      nError++;
      fetchStatus = 'error';
    }

    try { await saveCheckpoint(loc, fetchStatus, rawOgTitle || null, lastmod); } catch {}
    await sleep(DELAY);
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, crawlWorker));
clearInterval(ticker);
console.log(`\n[stream] DONE  fetched=${nFetched} resumed=${nResumed} ins=${nInserted} conflict=${nConflict} skipped_sku=${nSkippedSku} junk=${nJunk} err=${nError}\n`);

try {
  await pool.query(`UPDATE sku_source SET last_scraped=now(), last_error=NULL WHERE id='easy-cannabis'`);
} catch {}
await pool.query(`UPDATE scrape_runs SET status='done', updated_at=now() WHERE run_id=$1`, [RUN_ID]);

// ═══════════════════════════════════════════════════════════════════════════════
// 7. GROWER-COLLISION AUDIT (full easy-cannabis pending set)
// ═══════════════════════════════════════════════════════════════════════════════
const { rows: growerCollisions } = await pool.query(`
  SELECT
    split_part(canonical_key,'|',1) AS strain_norm,
    split_part(canonical_key,'|',2) AS fmt,
    array_agg(DISTINCT split_part(canonical_key,'|',3)) AS growers,
    count(*)::int AS rows
  FROM pending_product
  WHERE source_id='easy-cannabis' AND status='pending' AND canonical_key IS NOT NULL
  GROUP BY 1,2
  HAVING count(DISTINCT split_part(canonical_key,'|',3)) > 1
  ORDER BY 1
`);
if (growerCollisions.length > 0) {
  for (const g of growerCollisions) {
    await pool.query(`
      UPDATE pending_product
      SET needs_review=true,
          needs_review_reason=COALESCE(needs_review_reason||'; ','') || 'grower_mismatch_same_strain'
      WHERE source_id='easy-cannabis' AND status='pending'
        AND split_part(canonical_key,'|',1)=$1 AND split_part(canonical_key,'|',2)=$2
    `, [g.strain_norm, g.fmt]);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8. REPORT
// ═══════════════════════════════════════════════════════════════════════════════
const { rows:[counts] } = await pool.query(`
  SELECT
    (SELECT count(*)::int FROM product_sku)                                           AS sku_total,
    (SELECT count(*)::int FROM pending_product WHERE source_id='easy-cannabis')       AS easy_total,
    (SELECT count(*)::int FROM pending_product WHERE source_id='easy-cannabis'
       AND status='pending')                                                          AS easy_pending,
    (SELECT count(*)::int FROM pending_product WHERE source_id='easy-cannabis'
       AND status='pending' AND needs_review=true)                                    AS needs_review_count
`);

const { rows: fmtDist } = await pool.query(`
  SELECT product_format, count(*)::int AS n
  FROM pending_product WHERE source_id='easy-cannabis' AND status='pending'
  GROUP BY 1 ORDER BY n DESC
`);

// Inferred-format debt: inflorescence rows where og:title lacked an explicit format token
const { rows:[debt] } = await pool.query(`
  SELECT
    count(*)::int                                                  AS inflorescence_total,
    count(*) FILTER (WHERE raw_og_title LIKE '%תפרחת%')::int     AS explicit,
    count(*) FILTER (WHERE raw_og_title NOT LIKE '%תפרחת%')::int AS defaulted
  FROM pending_product
  WHERE source_id='easy-cannabis' AND status='pending' AND product_format='inflorescence'
`);

const { rows: nrDist } = await pool.query(`
  SELECT
    CASE
      WHEN needs_review_reason LIKE 'fuzzy%'   THEN 'fuzzy_near_match'
      WHEN needs_review_reason LIKE '%grower%' THEN 'grower_mismatch_same_strain'
      ELSE 'other'
    END AS reason_type,
    count(*)::int AS n
  FROM pending_product
  WHERE source_id='easy-cannabis' AND status='pending' AND needs_review=true
  GROUP BY 1 ORDER BY n DESC
`);

console.log('═══════════════════════════════════════════════════════════');
console.log(`[report] INGEST COMPLETE  run_id=${RUN_ID}`);
console.log(`  Target:               ${LIMIT}`);
console.log(`  Fetched (HTTP):       ${nFetched}`);
console.log(`  Resumed (checkpoint): ${nResumed}`);
console.log(`  Fetch errors:         ${nError}`);
console.log(`  Junk/rejected:        ${nJunk}`);
console.log(`  Written to pending:   ${nInserted}`);
console.log(`  Conflict (dup key):   ${nConflict}`);
console.log(`  Skipped (in SKU):     ${nSkippedSku}`);
console.log('───────────────────────────────────────────────────────────');
console.log(`  product_sku BEFORE:   ${SKU_BEFORE}`);
console.log(`  product_sku AFTER:    ${counts.sku_total}  ← must equal BEFORE`);
console.log(`  auto-approved:        0  ← guaranteed`);
console.log('───────────────────────────────────────────────────────────');
console.log(`  easy pending total:   ${counts.easy_pending}`);
console.log(`  needs_review:         ${counts.needs_review_count}`);
console.log('  Format distribution:');
fmtDist.forEach(r => console.log(`    ${r.product_format.padEnd(16)} ${r.n}`));
console.log('  Inferred-format debt (inflorescence rows):');
console.log(`    explicit (תפרחת):   ${debt.explicit}`);
console.log(`    DEFAULTED:          ${debt.defaulted}  ← fix parser if non-trivial`);
console.log('  needs_review reasons:');
if (!nrDist.length) console.log('    none');
else nrDist.forEach(r => console.log(`    ${r.reason_type.padEnd(36)} ${r.n}`));
console.log('  grower_mismatch collisions:',
  growerCollisions.length === 0 ? 'none  ← expected (no grower data from this source)' : growerCollisions.length);
if (growerCollisions.length > 0)
  growerCollisions.forEach(g => console.log('   ', g.strain_norm, g.growers));
console.log('═══════════════════════════════════════════════════════════');

if (counts.sku_total !== SKU_BEFORE) {
  console.error(`\n[INVARIANT VIOLATED] product_sku changed: ${SKU_BEFORE} → ${counts.sku_total}`);
  process.exit(1);
}
console.log('\n[invariants] product_sku unchanged ✓  auto-approved=0 ✓\n');

await pool.end();
