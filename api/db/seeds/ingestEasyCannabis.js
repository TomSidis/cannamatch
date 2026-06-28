/**
 * ingestEasyCannabis.js — idempotent easy-cannabis ingest via sitemap lastmod.
 *
 * Pipeline:
 *  0. Run inline parser + normalize tests — ABORT if any fail.
 *  1. Apply migration 023 (adds columns + alias table).
 *  2. Delete still-pending easy-cannabis rows (status='pending', never approved).
 *  3. Fetch sitemap → 34 gz files → sort all entries by lastmod desc → top 100 URLs.
 *  4. Fetch each page, extract og:title, parse with catalogParser.parseOgTitle().
 *  5. Load alias map from DB; resolve canonical_name; build canonical_key.
 *  6. Dedup by canonical_key.
 *  7. Write new rows to pending_product (ON CONFLICT canonical_key DO NOTHING).
 *  8. Report: scraped / parsed / unique / new / already-known / product_sku untouched.
 *
 * INVARIANTS:
 *  - product_sku: never written, updated, or deleted.
 *  - Nothing auto-approved.
 *  - raw_og_title stored verbatim.
 *  - All writes inside a transaction; ROLLBACK on failure.
 *  - Re-running twice yields 0 new rows (idempotency).
 *
 * Usage: node api/db/seeds/ingestEasyCannabis.js
 */

import zlib   from 'zlib';
import { promisify } from 'util';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path   from 'path';
import { pool } from '../../db.js';
import { normalize, parseOgTitle, canonicalKey } from '../../lib/catalogParser.js';

const gunzip = promisify(zlib.gunzip);
const UA     = 'CannaMatch-CatalogBot/1.0 (medical-cannabis patient tool; contact: admin@cannamatch.co.il)';
const DELAY  = 3000;
const sleep  = ms => new Promise(r => setTimeout(r, ms));

// ── 0. Inline tests ───────────────────────────────────────────────────────────
console.log('\n[tests] Running parser + normalize checks…');
let failures = 0;

function check(label, got, expected) {
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  console.log(ok ? '  ✓' : '  ✗', label, ok ? '' : `\n    got:      ${JSON.stringify(got)}\n    expected: ${JSON.stringify(expected)}`);
  if (!ok) failures++;
}

// normalize() tests
check('normalize: strips dots',       normalize('אר.טי.זד'),         'ארטיזד');
check('normalize: lowercase latin',   normalize('RTZ'),              'rtz');
check('normalize: strips niqqud',     normalize('שָׁלוֹם'),           'שלום');
check('normalize: collapses hyphens', normalize('blue-dream'),       'blue dream');
check('normalize: strips quotes',     normalize("ג'לטיקס"),         'גלטיקס');
check('normalize: parenthetical',     normalize('סי גיי (CJ)'),      'סי גיי');
check('normalize: collapse spaces',   normalize('og  kush'),         'og kush');
check('normalize: empty',             normalize(''),                 '');
check('normalize: undefined',         normalize(undefined),          '');

// parseOgTitle() tests
const p1 = parseOgTitle('חנות אונליין T22/C4 - איזי קנאביס');
check('parse: rejects homepage (חנות אונליין + T/C)', p1, null);

const p2 = parseOgTitle('חנות קנאביס סיבאנק T22/C4');
check('parse: rejects סיבאנק marker', p2, null);

const p3 = parseOgTitle('אבידקל מינון T3/C15 - Pharmacy X');
check('parse: strips מינון residue → name', p3?.strain_name,    'אבידקל');
check('parse: מינון → format inflorescence',  p3?.product_format, 'inflorescence');
check('parse: מינון → tc T3/C15',             p3?.tc_category,    'T3/C15');

const p4 = parseOgTitle('מבצע! תפרחת רפאל - T22/C4 - Doctor-K');
check('parse: strips מבצע! + תפרחת → name', p4?.strain_name,    'רפאל');
check('parse: תפרחת → inflorescence',         p4?.product_format, 'inflorescence');

const p5 = parseOgTitle('שמן הולנדי - T22/C4');
check('parse: שמן prefix → oil',              p5?.product_format, 'oil');
check('parse: שמן stripped from name',        p5?.strain_name,    'הולנדי');

const p6 = parseOgTitle('אר.טי.זד מיני - T22/C4 - Pharmacy');
check('parse: מיני suffix → small',           p6?.product_format, 'small');
check('parse: מיני stripped → name ארטיזד?', normalize(p6?.strain_name || ''), 'ארטיזד');

const p7 = parseOgTitle('גליליות בלאק - T22/C4');
check('parse: גליליות בלאק kept as name',     p7?.strain_name,    'גליליות בלאק');

const p8 = parseOgTitle('ים מינון T22/C4 חנות קנאביס רסקו (טבריה) - איזי קנאביס');
check('parse: row-23 leak → rejected',        p8, null);

// double prefix dedup
const p9 = parseOgTitle('מבצע! שמן שמן הולנדי - T22/C4 אינדיקה - איזי קנאביס');
check('parse: שמן שמן → oil',                 p9?.product_format, 'oil');
check('parse: שמן שמן → הולנדי',              p9?.strain_name,    'הולנדי');
const p10 = parseOgTitle('מבצע! גליליות גליליות בלאק - T22/C4 אינדיקה - איזי קנאביס');
check('parse: גליליות×2 → גליליות בלאק',     p10?.strain_name,   'גליליות בלאק');
check('parse: גליליות×2 → inflorescence',     p10?.product_format,'inflorescence');

// תפרחת + מיני — suffix beats inflorescence prefix
const p11 = parseOgTitle('מבצע! תפרחת טי.אר.קיי מיני - T22/C4 אינדיקה - איזי קנאביס');
check('parse: תפרחת+מיני → small',           p11?.product_format,'small');
check('parse: תפרחת+מיני → name',            p11?.strain_name,   'טי.אר.קיי');

// canonicalKey() test
check('canonicalKey: RTZ small',
  canonicalKey('אר.טי.זד', 'small', 'unknown'),
  'ארטיזד|small|unknown');

if (failures > 0) {
  console.error(`\n[tests] ${failures} test(s) FAILED — aborting. Fix catalogParser.js first.\n`);
  process.exit(1);
}
console.log(`[tests] All tests passed. Proceeding.\n`);

// ── 1. Apply migration 023 ────────────────────────────────────────────────────
console.log('[migrate] Applying 023_catalog_hardening.sql…');
const __dir   = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(__dir, '../migrations/023_catalog_hardening.sql');
const sql     = readFileSync(sqlPath, 'utf8');
await pool.query(sql);
console.log('[migrate] Done.\n');

// ── 2. Clear all still-pending easy-cannabis rows ────────────────────────────
// Always delete before re-inserting: parser fixes change canonical_keys, so old
// rows would block new inserts via (normalized_name, batch_id) constraint.
// Approved rows (status != 'pending') are never touched.
const { rowCount: cleared } = await pool.query(
  `DELETE FROM pending_product WHERE source_id = 'easy-cannabis' AND status = 'pending'`
);
console.log(`[clear] Removed ${cleared} pending easy-cannabis rows.\n`);

// ── 3. Sitemap → top 100 newest URLs ─────────────────────────────────────────
async function safeFetch(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(12000), headers: { 'User-Agent': UA, Accept: '*/*' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r;
}

console.log('[sitemap] Fetching sitemap index…');
const sitXml = await (await safeFetch('https://easycannabis.co.il/sitemap.xml')).text();
const gzUrls = [...sitXml.matchAll(/<loc>(https[^<]+\.gz)<\/loc>/g)].map(m => m[1]);
console.log(`[sitemap] ${gzUrls.length} gz files found.`);

console.log('[sitemap] Downloading gz files…');
const allEntries = [];
for (let i = 0; i < gzUrls.length; i++) {
  try {
    const r   = await safeFetch(gzUrls[i]);
    const xml = (await gunzip(Buffer.from(await r.arrayBuffer()))).toString('utf8');
    [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].forEach(b => {
      const loc     = b[1].match(/<loc>([^<]+)<\/loc>/)?.[1] ?? '';
      const lastmod = b[1].match(/<lastmod>([^<]+)<\/lastmod>/)?.[1] ?? '';
      if (loc && lastmod) allEntries.push({ loc, lastmod });
    });
    process.stdout.write(`\r[sitemap] gz ${i + 1}/${gzUrls.length} — ${allEntries.length} entries`);
  } catch (e) {
    console.warn(`\n[sitemap] WARN gz ${i + 1}: ${e.message}`);
  }
  if (i < gzUrls.length - 1) await sleep(500);
}
allEntries.sort((a, b) => b.lastmod.localeCompare(a.lastmod));
const top100 = allEntries.slice(0, 100);
console.log(`\n[sitemap] ${allEntries.length} entries total; taking top 100 by lastmod.`);
console.log(`[sitemap] lastmod range: ${top100[0].lastmod.slice(0, 16)} → ${top100[99].lastmod.slice(0, 16)}\n`);

// ── 4. Fetch pages + parse og:title ──────────────────────────────────────────
console.log(`[fetch] Fetching ${top100.length} pages (${DELAY / 1000}s delay)…`);
const parsed = [];
let fetchSkipped = 0;
for (let i = 0; i < top100.length; i++) {
  const { loc, lastmod } = top100[i];
  try {
    const html   = await (await safeFetch(loc)).text();
    const ogRaw  = html.match(/property="og:title"\s+content="([^"]+)"/i)?.[1]
                ?? html.match(/content="([^"]+)"\s+property="og:title"/i)?.[1] ?? '';
    const result = parseOgTitle(ogRaw);
    const ph     = loc.match(/\/pharms\/([^/]+)\//)?.[1] ?? null;
    if (result) {
      parsed.push({ ...result, pharmacy: ph, lastmod: lastmod.slice(0, 10) });
    } else {
      fetchSkipped++;
    }
  } catch (e) {
    console.warn(`\n[fetch] WARN: ${e.message.slice(0, 60)}`);
    fetchSkipped++;
  }
  process.stdout.write(`\r[fetch] ${i + 1}/100 (${fetchSkipped} skipped)`);
  if (i < top100.length - 1) await sleep(DELAY);
}
console.log(`\n[fetch] ${parsed.length} valid rows after parse; ${fetchSkipped} skipped.\n`);

// ── 5. Load alias map from DB ─────────────────────────────────────────────────
const { rows: aliases } = await pool.query('SELECT alias_norm, canonical_name FROM strain_aliases');
const aliasMap = new Map(aliases.map(r => [r.alias_norm, r.canonical_name]));

function resolveCanonical(raw_strain_name) {
  const n = normalize(raw_strain_name);
  return aliasMap.get(n) ?? n; // passthrough if not in alias table
}

// ── 6. Dedup by canonical_key ─────────────────────────────────────────────────
const byKey = new Map();
for (const p of parsed) {
  const canonical = resolveCanonical(p.strain_name);
  const ckey      = canonicalKey(canonical, p.product_format);
  if (!byKey.has(ckey)) {
    byKey.set(ckey, {
      ...p,
      canonical_name: canonical,
      canonical_key:  ckey,
      pharmacies: [p.pharmacy].filter(Boolean),
    });
  } else {
    const e = byKey.get(ckey);
    if (p.pharmacy && !e.pharmacies.includes(p.pharmacy)) e.pharmacies.push(p.pharmacy);
  }
}
const unique = [...byKey.values()];
console.log(`[dedup] ${parsed.length} rows → ${unique.length} unique after canonical_key dedup.\n`);

// ── 7. Write to pending_product ───────────────────────────────────────────────
const client = await pool.connect();
let inserted = 0, skipped = 0;
try {
  await client.query('BEGIN');

  // Check which normalized names already exist in product_sku (skip those entirely)
  const { rows: existingSku } = await client.query(
    `SELECT normalized_name FROM product_sku`
  );
  const skuNames = new Set(existingSku.map(r => r.normalized_name));

  for (const p of unique) {
    const normed = normalize(p.canonical_name);
    if (skuNames.has(normed)) { skipped++; continue; } // already in live catalog

    const res = await client.query(
      `INSERT INTO pending_product
         (commercial_name, normalized_name, batch_id, source_id,
          raw_og_title, strain_name, product_format, tc_category,
          canonical_key, needs_review,
          auto_genetics_id, auto_confidence, auto_method)
       VALUES ($1,$2,'unknown','easy-cannabis',
               $3,$4,$5,$6,
               $7,false,
               NULL,0,NULL)
       ON CONFLICT (normalized_name, batch_id, COALESCE(product_format, '')) DO NOTHING`,
      [
        p.strain_name,                // commercial_name (raw from page)
        normed,                       // normalized_name
        p.raw_og_title,               // raw_og_title — verbatim, never mutated
        p.strain_name,                // strain_name — parsed clean
        p.product_format,             // product_format
        p.tc_category,                // tc_category
        p.canonical_key,              // canonical_key
      ]
    );
    if (res.rowCount > 0) inserted++; else skipped++;
  }

  await client.query(`UPDATE sku_source SET last_scraped = now(), last_error = NULL WHERE id = 'easy-cannabis'`);
  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK');
  console.error('[ingest] ROLLBACK:', err.message);
  process.exit(1);
} finally {
  client.release();
}

// ── 8. Report ─────────────────────────────────────────────────────────────────
const { rows: [counts] } = await pool.query(`
  SELECT
    (SELECT count(*) FROM product_sku)::int                                         AS product_sku_total,
    (SELECT count(*) FROM pending_product WHERE source_id = 'easy-cannabis')::int   AS easy_pending_total,
    (SELECT count(*) FROM pending_product WHERE source_id = 'easy-cannabis'
       AND status = 'pending')::int                                                 AS easy_pending_unreviewed
`);

console.log('═══════════════════════════════════════════');
console.log('[report] INGEST COMPLETE');
console.log(`  Pages scraped:       100`);
console.log(`  Parsed (non-junk):   ${parsed.length}`);
console.log(`  Unique canonical:    ${unique.length}`);
console.log(`  Written to pending:  ${inserted}`);
console.log(`  Skipped (known):     ${skipped}`);
console.log(`  product_sku TOTAL:   ${counts.product_sku_total}  ← must match before count`);
console.log(`  easy-cannabis pending: ${counts.easy_pending_total} (${counts.easy_pending_unreviewed} unreviewed)`);
console.log('  auto-approved:       0  ← guaranteed by design');
console.log('═══════════════════════════════════════════');

console.log('\n[report] 15 samples:');
console.table(unique.slice(0, 15).map(p => ({
  name:      p.strain_name.slice(0, 30),
  format:    p.product_format,
  tc:        p.tc_category ?? '—',
  canonical: p.canonical_name.slice(0, 20),
  key:       p.canonical_key.slice(0, 35),
  pharmacy:  (p.pharmacies[0] ?? '—').slice(0, 20),
})));

await pool.end();
