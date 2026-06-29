/**
 * catalogParser.js — normalize() + parseOgTitle() + canonicalKey()
 *
 * Rules (from spec):
 *  - normalize(): NFC → strip niqqud → lowercase → strip punctuation/dots → collapse whitespace
 *  - parseOgTitle(): reject homepages (even with T/C); extract strain_name, product_format, tc_category
 *  - canonicalKey(): normalize(strain_name) | product_format | normalize(grower)
 *
 * All functions are pure. No DB access here.
 */

// ── normalize ──────────────────────────────────────────────────────────────────
export function normalize(s = '') {
  return (s || '')
    .normalize('NFC')
    // Hebrew niqqud (vowel marks U+05B0–U+05BD, U+05BF, U+05C1–U+05C2, U+05C4–U+05C5, U+05C7)
    .replace(/[ְ-ׇֽֿׁׂׅׄ]/g, '')
    .toLowerCase()
    // strip dots, quotes, apostrophes, slashes, common punctuation — preserve Hebrew + Latin + digits + spaces
    .replace(/['"'׳״.!?\/\\@#$%^*+=<>|~`]/g, '')
    // parenthetical content (remove "(CJ)", "(city name)", etc.)
    .replace(/\s*\([^)]{0,30}\)/g, '')
    // hyphens/dashes/underscores → space
    .replace(/[-–—_]+/g, ' ')
    // collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

// ── HTML entity decode ─────────────────────────────────────────────────────────
function decodeEntities(s) {
  return (s || '')
    .replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

// ── Homepage rejection ─────────────────────────────────────────────────────────
// See step 1 in parseOgTitle for full logic.

// ── Format detection ───────────────────────────────────────────────────────────
// Prefixes: product type appears at start of cleaned title → identifies format, stripped from name.
// Suffixes: size modifier at end → "small", stripped from name.
// NOTE: "גליליות" intentionally excluded — doubles as strain name "גליליות בלאק" (Galilean Black).
const FORMAT_PREFIXES = [
  { re: /^שמן\s+/u,                       format: 'oil'           },
  { re: /^(קפסולות|כמוסות|קפסולה)\s+/u,   format: 'capsule'       },
  { re: /^(פרירול|פרה.?רול|pre.?roll)\s+/ui, format: 'pre_roll'    },
  { re: /^תפרחת\s+/u,                     format: 'inflorescence' },
];
const FORMAT_SUFFIXES = [
  { re: /\s+(מיניז|מיני|סמול)$/iu, format: 'small' },
];

// ── parseOgTitle ───────────────────────────────────────────────────────────────
export function parseOgTitle(rawOgTitle) {
  if (!rawOgTitle) return null;
  const raw = decodeEntities(rawOgTitle).trim();

  // 1. Reject homepages — before T/C extraction.
  //    חנות אונליין + סיבאנק: unconditional (homepage even if T/C present).
  //    חנות קנאביס: position-aware — Easy Cannabis product pages use this phrase
  //    AFTER the T/C marker as a pharmacy descriptor. Only reject if it appears
  //    BEFORE T/C (or with no T/C at all), which is the actual homepage pattern.
  const HOMEPAGE_HARD = [/חנות.{0,8}אונליין/u, /סיבאנק/u];
  if (HOMEPAGE_HARD.some(re => re.test(raw))) return null;
  const _tcIdx = raw.search(/T\d+\/C\d+/i);
  const _hkIdx = raw.search(/חנות.{0,8}קנאביס/u);
  if (_hkIdx !== -1 && (_tcIdx === -1 || _hkIdx < _tcIdx)) return null;

  // 2. Extract T/C
  const tcMatch = raw.match(/T(\d+)\/C(\d+)/i);
  const tc_category = tcMatch ? `T${tcMatch[1]}/C${tcMatch[2]}` : null;

  // 3. Strip sale badge + cut at T/C boundary
  let name = raw
    .replace(/^מבצע!\s*/u, '')
    .replace(/\s*T\d+\/C\d+[\s\S]*$/i, '')   // everything from T../C.. onwards
    .replace(/\s*[-–]+\s*$/, '')              // trailing dash after cut
    .trim();

  // 3b. Deduplicate repeated leading word — site sometimes emits "גליליות גליליות בלאק"
  //     or "שמן שמן הולנדי". Strip the extra copy, keep one (which step 5 may then strip further).
  name = name.replace(/^(\S+)\s+\1(\s+)/u, '$1$2').trim();

  // 4. Strip trailing " - pharmacy-or-context"
  name = name.replace(/\s*[-–]\s*[א-תA-Za-z].{2,60}$/u, '').trim();

  // 5. Detect and strip format PREFIX (single replace — dedup above handles doubles)
  let product_format = null;
  for (const { re, format } of FORMAT_PREFIXES) {
    if (re.test(name)) {
      name = name.replace(re, '').trim();
      product_format = format;
      break;
    }
  }

  // 6. Detect and strip format SUFFIX — always runs; 'small' beats 'inflorescence'
  //    e.g. "תפרחת X מיני" → after prefix strip: "X מיני" → suffix: format=small
  for (const { re, format } of FORMAT_SUFFIXES) {
    if (re.test(name)) {
      name = name.replace(re, '').trim();
      product_format = format;
      break;
    }
  }

  // 7. Strip "מינון" / "קטגוריית מינון" dosage residue
  name = name.replace(/\s*(קטגוריית\s+)?מינון\s*$/u, '').trim();

  // 8. Default format
  if (!product_format) product_format = 'inflorescence';

  // 9. Reject if name too short or empty
  if (!name || name.length < 2) return null;

  return { raw_og_title: rawOgTitle, strain_name: name, product_format, tc_category };
}

// ── canonicalKey ───────────────────────────────────────────────────────────────
// canonical_key = normalize(strain_name) | product_format | normalize(grower)
// After alias resolution: strain_name should already be the canonical_name from DB.
export function canonicalKey(strain_name, product_format, grower = 'unknown') {
  const n = normalize(strain_name || '');
  const g = normalize(grower || 'unknown') || 'unknown';
  return `${n}|${product_format}|${g}`;
}
