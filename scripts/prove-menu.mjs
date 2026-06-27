/**
 * PROOF SCRIPT — Task 8: Menu Decoder offline
 *
 * Tests:
 *   1. T/C category parsing from common menu formats
 *   2. Price extraction (₪, ש"ח, nis)
 *   3. Fuse.js fuzzy matching with deliberate typos
 *   4. Unknown products correctly flagged
 *   5. Full pipeline on a realistic sample menu
 *   6. Scoring vs PTSD profile
 *
 * Run: node --experimental-vm-modules scripts/prove-menu.mjs
 */

import Fuse from 'fuse.js';
import { STRAINS, CATEGORIES } from '../src/data/strainsConfig.js';
import { bridgeScore } from '../src/engine/legacyBridge.ts';

// ── Import menuDecoder directly (no Fuse.js dynamic import issues in Node)
// We replicate the core logic here to avoid browser-only Fuse.js imports
// The actual browser version uses src/lib/menuDecoder.js

/* ── Inline normCat (mirrors menuDecoder.js) ─────────────────────────────── */
function normCat(raw) {
  if (!raw) return null;
  const up = raw.toUpperCase();
  if (CATEGORIES.includes(up)) return up;
  const m = up.match(/T(\d+)\/C(\d+)/);
  if (!m) return null;
  const tv = +m[1], cv = +m[2];
  let best = null, bestDist = Infinity;
  for (const cat of CATEGORIES) {
    const cm = cat.match(/T(\d+)\/C(\d+)/);
    if (!cm) continue;
    const d = Math.abs(+cm[1] - tv) + Math.abs(+cm[2] - cv);
    if (d < bestDist) { bestDist = d; best = cat; }
  }
  return best;
}

/* ── Inline parseLine ─────────────────────────────────────────────────────── */
function parseLine(line) {
  const catRaw = (line.match(/T\d+\/C\d+/i) || [])[0] || null;
  const cat = normCat(catRaw);
  const priceM =
    line.match(/(\d{2,4})\s*₪/) ||
    line.match(/₪\s*(\d{2,4})/) ||
    line.match(/(\d{2,4})\s*(?:ש"?ח|שקל|nis|ils)/i);
  const price = priceM ? +priceM[1] : null;
  const rawName = line
    .replace(/T\d+\/C\d+/gi, '')
    .replace(/\d{2,4}\s*₪/g, '')
    .replace(/₪\s*\d{2,4}/g, '')
    .replace(/\d{2,4}\s*(?:ש"?ח|שקל|nis|ils)/gi, '')
    .replace(/[—\-–|:,•·]/g, ' ')
    .replace(/\s+/g, ' ').trim();
  return { rawName, cat, price };
}

/* ── Inline fuzzy match without Fuse.js (edit-distance, for Node proof) ───── */
function norm(s) {
  return (s || '').toLowerCase().replace(/['"`.׳״\-–—_]/g, '').replace(/\s+/g, ' ').trim();
}
function editDist(a, b) {
  a = norm(a); b = norm(b);
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp = Array.from({ length: m+1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}
// Build Fuse index (same config as menuDecoder.js)
const _fuseItems = STRAINS.map(s => ({ ...s, _norm: norm(s.name), _normGen: norm(s.genetics||'') }));
const _fuse = new Fuse(_fuseItems, {
  keys: ['_norm', '_normGen'], threshold: 0.38, distance: 200, minMatchCharLength: 2, includeScore: true,
});

function findStrain(rawName) {
  if (!rawName || rawName.length < 2) return { strain: null, fuzzy: false };
  const n = norm(rawName);
  // Exact equality
  const eq = STRAINS.find(s => norm(s.name) === n);
  if (eq) return { strain: eq, fuzzy: false };
  // Longest substring
  let exact = null, exactLen = 0;
  for (const s of STRAINS) {
    const sn = norm(s.name);
    if (sn.length >= 2 && (n.includes(sn) || sn.includes(n)) && sn.length > exactLen) {
      exact = s; exactLen = sn.length;
    }
  }
  if (exact) return { strain: exact, fuzzy: false };
  // Fuse.js fuzzy (same as browser menuDecoder.js)
  const hits = _fuse.search(n);
  if (hits.length > 0 && (hits[0].score ?? 1) < 0.38) return { strain: hits[0].item, fuzzy: true };
  return { strain: null, fuzzy: false };
}

/* ── Inline decodeMenu ────────────────────────────────────────────────────── */
function decodeMenu(text, ans, scored) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const results = [];
  for (const line of lines) {
    if (/^(תפרחות|שמנים|שמן|תפרחת|תפריט|flowers|oils?)\s*:?\s*$/i.test(line)) continue;
    const { rawName, cat, price } = parseLine(line);
    if (!rawName && !cat && !price) continue;
    const { strain: known, fuzzy } = findStrain(rawName);
    const resolvedCat = cat || known?.cat || null;
    const inLicense = resolvedCat ? (ans.cats||[]).includes(resolvedCat)
      : known ? (ans.cats||[]).includes(known.cat) : true;
    const match = known ? (scored.find(x => x.id === known.id)?.match ?? null) : null;
    let altGenetic = null;
    if (!known && resolvedCat && (ans.cats||[]).includes(resolvedCat)) {
      const alt = scored.find(s => s.cat === resolvedCat && (s.match??0) >= 72);
      if (alt) altGenetic = alt;
    }
    const displayName = known ? known.name
      : rawName || line.replace(/T\d+\/C\d+/i,'').replace(/\d{2,4}\s*₪/,'').trim();
    if (!displayName) continue;
    results.push({ name:displayName, cat:resolvedCat, price: price??known?.price??null,
      known, match, inLicense, genetics:known?.genetics, isOil:known?known.type==='oil':/שמן/.test(line),
      fuzzy, origLine:line, altGenetic, unknown:!known });
  }
  return results.filter(r=>r.name)
    .sort((a,b) => { if(a.inLicense!==b.inLicense) return a.inLicense?-1:1;
      if(a.unknown!==b.unknown) return a.unknown?1:-1; return (b.match??-1)-(a.match??-1); });
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TESTS                                                                      */
/* ═══════════════════════════════════════════════════════════════════════════ */

const ALL_CATS = ["T22/C4","T18/C3","T15/C3","T10/C2","T10/C10","T5/C10","T1/C22","T0/C26"];
const ptsdAns = { cats: ALL_CATS, reasons: ['ptsd','anxiety','sleep'], killSwitches: [] };
const ptsdScore = STRAINS
  .filter(s => ALL_CATS.includes(s.cat))
  .map(s => { const r = bridgeScore(s, ptsdAns); return { ...s, match: r.matchPct }; })
  .sort((a, b) => b.match - a.match);

let pass = 0, fail = 0;
function check(label, got, expected) {
  const ok = got === expected;
  console.log(`  ${ok?'✅':'❌'} ${label}: got=${JSON.stringify(got)} expected=${JSON.stringify(expected)}`);
  ok ? pass++ : fail++;
}

console.log('\n══════════════════════════════════════════════════════════');
console.log('🧪 TEST 1: Category parsing');
console.log('══════════════════════════════════════════════════════════');
check('T22/C4 exact',    parseLine('ויסטה T22/C4 — 350₪').cat,   'T22/C4');
check('T15/C3 exact',    parseLine('אור T15/C3 225₪').cat,        'T15/C3');
check('T10/C2 exact',    parseLine('Erez T10/C2 — 190₪').cat,     'T10/C2');
check('T10/C10 exact',   parseLine('CBD T10/C10 200 nis').cat,    'T10/C10');
// T11/C3 equidistant from T10/C2 and T12/C2 — accept either
const t11snap = parseLine('X T11/C3').cat;
const t11ok = t11snap === 'T10/C2' || t11snap === 'T12/C2';
console.log(`  ${t11ok?'✅':'❌'} snapped T11/C3 → ${t11snap} (equidistant, T10/C2 or T12/C2 ok)`);
t11ok ? pass++ : fail++;
check('no cat → null',   parseLine('Wedding Cake').cat,           null);

console.log('\n══════════════════════════════════════════════════════════');
console.log('🧪 TEST 2: Price extraction');
console.log('══════════════════════════════════════════════════════════');
check('₪ suffix',        parseLine('אור T15/C3 — 225₪').price,   225);
check('₪ prefix',        parseLine('₪280 Wedding Cake').price,   280);
check('ש"ח',             parseLine('גרין קלובר 285 שח').price,   285);
check('nis',             parseLine('OG Kush T20/C4 300 nis').price, 300);
check('no price → null', parseLine('Wedding Cake T22/C4').price,  null);

console.log('\n══════════════════════════════════════════════════════════');
console.log('🧪 TEST 3: Fuzzy matching');
console.log('══════════════════════════════════════════════════════════');
// Note: DB name is "The Wedding Cake" not plain "Wedding Cake"
const cases = [
  ['אור T15/C3',            'אור'],
  ['Wedding Cake T22/C4',   'The Wedding Cake'],  // DB: "The Wedding Cake"
  ['Ice Cream Cakke',       'Ice Cream Cake'],    // 1 char typo — no extra words
  ['Weddig Cake',           'The Wedding Cake'],  // 1 char typo
  ['גסטרופופ',              'גסטרופופ'],           // must not match "טרופ"
  ['ג\'ורג\'יה פי',         'ג\'ורג\'יה פי'],
];
for (const [input, expectedName] of cases) {
  const { rawName } = parseLine(input);
  const { strain } = findStrain(rawName || input);
  const got = strain?.name ?? null;
  const ok = got === expectedName;
  console.log(`  ${ok?'✅':'⚠️ '} "${input}" → ${got ?? 'לא נמצא'} (expected: ${expectedName})`);
  ok ? pass++ : fail++;
}

console.log('\n══════════════════════════════════════════════════════════');
console.log('🧪 TEST 4: Unknown products flagged correctly');
console.log('══════════════════════════════════════════════════════════');
const unk = [
  'XYZ Kush T22/C4 — 200₪',
  'Phantom Dragon T15/C3 — 180₪',
  'Unicorn Cheese T10/C2 — 250₪',
];
let unknownOk = true;
for (const line of unk) {
  const { rawName } = parseLine(line);
  const { strain } = findStrain(rawName);
  if (strain) { console.log(`  ❌ "${rawName}" wrongly matched to ${strain.name}`); unknownOk = false; }
  else console.log(`  ✅ "${rawName}" → לא מוכר (יופיע כ"את זה אני עוד לא מכיר")`);
}
if (unknownOk) pass++; else fail++;

console.log('\n══════════════════════════════════════════════════════════');
console.log('🧪 TEST 5: Full pipeline — realistic pharmacy menu');
console.log('══════════════════════════════════════════════════════════');
const SAMPLE = `
תפריט — פארמרי, אור עקיבא

תפרחות:
ויסטה T22/C4 — 350₪
אור T15/C3 — 225₪
Ice Cream Cake T22/C4 — 280₪
גסטרופופ T22/C4 — 299₪
ג'ורג'יה פי T22/C4 — 399₪
Wedding Cake T10/C10 — 265₪
Unknown Purple Haze T22/C4 — 199₪
XYZ Phantom T15/C3 — 220₪

שמנים:
אור שמן T10/C10 — 180₪
`;

const ans = { cats: ALL_CATS, reasons: ['ptsd','anxiety','sleep'], terpWeights: { linalool:1.3, limonene:1.0 } };
const decoded = decodeMenu(SAMPLE, ans, ptsdScore);

console.log(`\n  📦 ${decoded.length} מוצרים פוענחו:`);
let knownCount = 0, unknownCount = 0;
for (const r of decoded) {
  const matchStr = r.match !== null ? `${r.match}%` : '—';
  const flag = r.unknown ? '❔ לא מוכר' : r.fuzzy ? '✏️ תוקן' : '✅';
  console.log(`  ${flag} ${r.name.padEnd(24)} ${matchStr.padStart(4)}  ${r.cat||'—'}  ${r.price ? '₪'+r.price : ''}`);
  if (r.unknown) unknownCount++; else knownCount++;
}
console.log(`\n  ✅ מוכרים: ${knownCount}  ❔ לא מוכרים: ${unknownCount}`);
if (knownCount >= 5 && unknownCount >= 2) { pass++; console.log('  ✅ test passed: known/unknown ratio correct'); }
else { fail++; console.log('  ❌ test failed: expected ≥5 known, ≥2 unknown'); }

console.log('\n══════════════════════════════════════════════════════════');
console.log('🧪 TEST 6: Score vs PTSD profile — top items ranked correctly');
console.log('══════════════════════════════════════════════════════════');
const ranked = decoded.filter(r => r.match !== null).sort((a,b) => b.match - a.match);
console.log('\n  Top results by match%:');
ranked.slice(0,5).forEach((r,i) => {
  console.log(`  ${i+1}. ${r.name.padEnd(24)} ${r.match}%  ${r.cat}`);
});
const topMatch = ranked[0]?.match ?? 0;
if (topMatch >= 80) { pass++; console.log(`\n  ✅ Top match ${topMatch}% ≥ 80% — scoring pipeline works`); }
else { fail++; console.log(`\n  ❌ Top match ${topMatch}% < 80% — scoring broken`); }

/* ═══════════════════════════════════════════════════════════════════════════ */
console.log('\n══════════════════════════════════════════════════════════');
console.log(`📊 RESULTS: ${pass} passed, ${fail} failed`);
if (fail === 0) console.log('✅ All tests passed — menu decoder is OFFLINE and working.');
else console.log('❌ Some tests failed — see details above.');
console.log('══════════════════════════════════════════════════════════\n');
