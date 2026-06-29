/**
 * menuDecoder — 100% offline menu parsing pipeline.
 *
 * Pipeline: raw text → parse lines → Fuse.js fuzzy match → score vs profile → rank
 *
 * No API keys. No network. Runs in the browser or in Node.js (for tests).
 */
import Fuse from "fuse.js";
import { STRAINS, CATEGORIES } from "../data/strainsConfig.js";

// ── Normalization ────────────────────────────────────────────────────────────

function norm(s) {
  return (s || "")
    .toLowerCase()
    .replace(/['"` ׳״.\-–—_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Actual DB categories (derived from STRAINS) ──────────────────────────────
// These are the real category codes used by the strain catalog.
// CATEGORIES (from strainsConfig) is the regulatory list — these two differ.
const DB_CATS = [...new Set(STRAINS.map((s) => s.cat))];

// ── Category snapping ────────────────────────────────────────────────────────

export function normCat(raw) {
  if (!raw) return null;
  const up = raw.toUpperCase().trim();
  // Exact match against actual DB cats first
  if (DB_CATS.includes(up)) return up;
  // Exact match against regulatory list
  if (CATEGORIES.includes(up)) return up;
  const m = up.match(/T(\d+)\/C(\d+)/);
  if (!m) return null;
  const tv = +m[1], cv = +m[2];
  // Snap to nearest actual DB cat (not regulatory list)
  let best = null, bestDist = Infinity;
  for (const cat of DB_CATS) {
    const cm = cat.match(/T(\d+)\/C(\d+)/);
    if (!cm) continue;
    const d = Math.abs(+cm[1] - tv) + Math.abs(+cm[2] - cv);
    if (d < bestDist) { bestDist = d; best = cat; }
  }
  return best;
}

// ── Pharmacy code / abbreviation aliases ─────────────────────────────────────
// Maps known pharmacy-printed codes to strain IDs for instant lookup.
const CODE_MAP = {
  "p&z":      "s1",  // Purple Zkittlez
  "pz":       "s1",
  "carbo":    "s4",  // Carbon Fiber
  "icc":      "s8",  // Ice Cream Cake
  "wck":      "s3",  // Wedding CK
  "weddingck":"s3",
  "twc":      "s10", // The Wedding Cake
  "wk":       "s13", // Wedding Crasher
  "ju":       "s5",  // מדיקיין יום
  "lit":      "s14", // Lit Mango
  "gmo":      "s29", // GMO / Garlic Cookies
  "jl":       "s28",
  "jop":      "s27",
};

// ── Fuse.js index (lazy singleton) ──────────────────────────────────────────

let _fuse = null;

function getFuse() {
  if (_fuse) return _fuse;
  const items = STRAINS.map((s) => ({
    ...s,
    _norm:    norm(s.name),
    _normGen: norm(s.genetics || ""),
  }));
  _fuse = new Fuse(items, {
    keys: [
      { name: "_norm",    weight: 2 },
      { name: "_normGen", weight: 1 },
    ],
    threshold:         0.38,
    distance:          200,
    minMatchCharLength: 2,
    includeScore:      true,
  });
  return _fuse;
}

// ── Fuzzy find ───────────────────────────────────────────────────────────────

export function fuseFind(rawName) {
  if (!rawName || rawName.length < 2) return { strain: null, fuzzy: false };

  const n = norm(rawName);

  // Priority 0: exact code alias (P&Z, ICC, etc.)
  const code = CODE_MAP[n];
  if (code) {
    const s = STRAINS.find((x) => x.id === code);
    if (s) return { strain: s, fuzzy: false };
  }

  const fuse = getFuse();

  // Priority 1: exact equality after normalisation
  const eqMatch = STRAINS.find((s) => norm(s.name) === n);
  if (eqMatch) return { strain: eqMatch, fuzzy: false };

  // Priority 2: longest substring — avoids "טרופ" beating "גסטרופופ"
  let exact = null, exactLen = 0;
  for (const s of STRAINS) {
    const sn = norm(s.name);
    if (sn.length >= 2 && (n.includes(sn) || sn.includes(n)) && sn.length > exactLen) {
      exact = s; exactLen = sn.length;
    }
  }
  if (exact) return { strain: exact, fuzzy: false };

  // Priority 3: Fuse.js fuzzy (typo-tolerant)
  const hits = fuse.search(n);
  if (hits.length > 0 && (hits[0].score ?? 1) < 0.38) {
    return { strain: hits[0].item, fuzzy: true };
  }

  return { strain: null, fuzzy: false };
}

// ── Line parser ──────────────────────────────────────────────────────────────

export function parseLine(line) {
  const catRaw = (line.match(/T\d{1,2}\/C\d{1,2}/i) || [])[0] || null;
  const cat = normCat(catRaw);

  const priceM =
    line.match(/(\d{2,4})\s*₪/) ||
    line.match(/₪\s*(\d{2,4})/) ||
    line.match(/(\d{2,4})\s*(?:ש"?ח|שקל|nis|ils)/i);
  const rawPrice = priceM ? +priceM[1] : null;
  // Sane per-10g range in Israel: ₪100–₪600. Discard OCR mis-reads.
  const price = rawPrice !== null && rawPrice >= 100 && rawPrice <= 600 ? rawPrice : null;

  // Name: strip category, price, common separators, leading/trailing junk
  const rawName = line
    .replace(/T\d{1,2}\/C\d{1,2}/gi, "")
    .replace(/\d{2,4}\s*₪/g, "")
    .replace(/₪\s*\d{2,4}/g, "")
    .replace(/\d{2,4}\s*(?:ש"?ח|שקל|nis|ils)/gi, "")
    .replace(/[—\-–|:,•·]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { rawName, cat, price };
}

// ── Unknown-name plausibility guard ──────────────────────────────────────────
// Applied ONLY to unmatched (unknown) lines before they reach the UI or pending queue.
// Known DB matches are always trusted — they passed fuseFind already.
//
// Rejects (in addition to original rules):
//   • Any price signal: ₪ symbol, "ש"ח", number+₪ — menu lines not strain names
//   • Garbage chars: ~ = ` ^ that appear in OCR artifacts
//   • "תפריט" keyword — menu header lines
//   • Ellipsis / multiple dots anywhere (OCR truncation)
//   • Standalone price-like numbers (100–999) with no alphabetic context
//   • Lines where < 30% of non-space chars are letters — mostly numeric/symbolic
export function isPlausibleProductName(rawName, cat) {
  const s = rawName?.trim();
  if (!s || s.length < 4) return false;
  if (/^[§#*►•·\-–—→←]/.test(s)) return false;
  if (/עד\s*\d+\s*ש/.test(s)) return false;
  if (!/[א-תa-zA-Z]{3,}/.test(s)) return false;
  if (s.length < 8 && !cat) return false;
  // Date fragments: ".06.2026", "06/2026" — OCR menu headers
  if (/\.\d{2}[./]\d{2,4}|\d{2}\/\d{2,4}/.test(s)) return false;
  // Barcode / ID: 5+ consecutive digits
  if (/\d{5,}/.test(s)) return false;
  // Truncated OCR lines
  if (/\.{2,}/.test(s)) return false;
  // Price signals — ₪ or "שח/ש"ח" anywhere
  if (/₪|ש"ח|שח\b/.test(s)) return false;
  // Garbage chars common in OCR artifacts (~ = ` ^ and standalone double-quote)
  if (/[~=`^"]/.test(s)) return false;
  // Implausible length: a strain name is never a full sentence
  if (s.length > 60) return false;
  // Hash = lot/batch reference (RG#7, GW#3)
  if (/#/.test(s)) return false;
  // Version/date dot notation: 5.6.00, 1.2.3
  if (/\d+\.\d+\.\d+/.test(s)) return false;
  // CamelCase single-letter flip (e.g. "fF") — OCR code artifact
  if (/\b[a-z][A-Z]\b/.test(s)) return false;
  // Menu header keyword
  if (/תפריט/.test(s)) return false;
  // Letter density: less than 30% of non-space chars are letters → likely garbage
  const nonSpace = s.replace(/\s/g, '');
  const letters = (nonSpace.match(/[א-תa-zA-Z]/g) || []).length;
  if (nonSpace.length > 6 && letters / nonSpace.length < 0.3) return false;
  return true;
}

// ── Unknown-strain learning (localStorage) ───────────────────────────────────
// Saves unrecognised names so feature #10 (new-strain learning) can process them.

function recordUnknown(name, cat, price) {
  if (typeof localStorage === "undefined") return;
  try {
    const key = "cm_unknown_strains";
    const list = JSON.parse(localStorage.getItem(key) || "[]");
    if (!list.some((s) => s.name === name)) {
      list.push({ name, cat, price: price ?? null, seenAt: Date.now() });
      localStorage.setItem(key, JSON.stringify(list.slice(-100)));
    }
  } catch {}
}

// ── Main decode pipeline ─────────────────────────────────────────────────────

/**
 * decodeMenu — parse raw menu text, fuzzy-match strains, score vs profile.
 *
 * @param {string} text       — raw OCR or pasted menu text
 * @param {object} ans        — user profile: { cats: string[] }
 * @param {Array}  scored     — output of engine.scoreAll(): [{ id, match, ... }]
 * @returns {Array} decoded products, sorted by match desc (unknown last)
 */
export function decodeMenu(text, ans, scored) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const results = [];
  const seen = new Set(); // deduplicate by resolved name

  for (const line of lines) {
    // Skip section headers and menu titles
    if (/^(תפרחות|שמנים|שמן|תפרחת|flowers|oils?)\s*:?\s*$/i.test(line)) continue;
    if (/תפריט[\s‏]/i.test(line) && !/\d/.test(line)) continue; // menu title lines have no digits
    if (/^(בית\s+מרקחת|pharmacy|menu|תפריט)\b/i.test(line) && !/₪|\d{2,4}\s*(?:ש"?ח|nis)/.test(line)) continue;
    // Skip very short lines that are clearly not products
    if (line.length < 3) continue;

    const { rawName, cat, price } = parseLine(line);
    if (!rawName && !cat && !price) continue;

    const { strain: known, fuzzy } = fuseFind(rawName);

    // For known strains: always use their exact DB cat (not OCR-snapped cat)
    // For unknown strains: use OCR-parsed (snapped) cat if available
    const resolvedCat = known ? known.cat : (cat || null);

    const inLicense = resolvedCat
      ? (ans.cats || []).includes(resolvedCat)
      : true; // no cat info → show it, user decides

    const match = known
      ? (scored.find((x) => x.id === known.id)?.match ?? null)
      : null;

    // Alt genetic: for unknown products, suggest best same-cat scored strain
    let altGenetic = null;
    if (!known && resolvedCat && (ans.cats || []).includes(resolvedCat)) {
      const alt = scored.find((s) => s.cat === resolvedCat && (s.match ?? 0) >= 72);
      if (alt) altGenetic = alt;
    }

    const displayName = known
      ? known.name
      : rawName ||
        line
          .replace(/T\d{1,2}\/C\d{1,2}/i, "")
          .replace(/\d{2,4}\s*₪/, "")
          .trim();

    if (!displayName || displayName.length < 2) continue;
    // Unknown entries must pass plausibility — quarantine OCR/formatting garbage
    if (!known && !isPlausibleProductName(displayName, resolvedCat)) continue;
    if (seen.has(displayName)) continue;
    seen.add(displayName);

    // Record unknowns for learning
    if (!known && displayName.length >= 3) {
      recordUnknown(displayName, resolvedCat, price);
    }

    results.push({
      name:       displayName,
      cat:        resolvedCat,
      price:      price ?? known?.price ?? null,
      known,
      match,
      inLicense,
      genetics:   known?.genetics,
      isOil:      known ? known.type === "oil" : /שמן/.test(line),
      fuzzyMatch: fuzzy,
      origLine:   line,
      altGenetic,
      unknown:    !known,
    });
  }

  return results
    .filter((r) => r.name)
    .sort((a, b) => {
      // In-license first, then by match score desc, unknowns last
      if (a.inLicense !== b.inLicense) return a.inLicense ? -1 : 1;
      if (a.unknown !== b.unknown) return a.unknown ? 1 : -1;
      return (b.match ?? -1) - (a.match ?? -1);
    });
}
