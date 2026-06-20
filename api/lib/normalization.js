// ─────────────────────────────────────────────────────────────
//  קנאמאצ׳ — Normalization & Translation Pipeline
//  שלב קבלה: ניקוי → תרגום → התאמה → פתרון עמימות
// ─────────────────────────────────────────────────────────────

// ── Translation dictionary: Hebrew/English → canonical string ──
// ערכים הם שמות קנוניים (אנגלית, lowercase, ללא מקפים)
const TRANSLATION_DICT = {
  // ── Hebrew brand names ──
  "תכלת": "tehelet",
  "תכלת (יום)": "tehelet day",
  "ספיישל טי": "special t",
  "ויטה ורדה": "vita verde",
  "שלג": "sheleg",
  "ארז": "erez",
  "אורן": "oren",
  "קציר": "katzir",
  "זמורה": "zmora",
  "גדיש": "gadish",
  "גפן": "gefen",
  "עמוד": "amud",
  "צוף": "tzuf",
  "בוסתן": "bustan",
  "ברקת": "beket",
  "ענבר": "anbar",
  "לבנה": "livna",
  "אלון": "alon",
  "מרווה": "marva",
  "שמשון": "shimshon",
  "נרקיס": "narkis",
  "רותם": "rotem",
  "ריחן": "reihan",

  // ── Commercial shorthand → canonical ──
  "p&z": "purple zkittlez",
  "p & z": "purple zkittlez",
  "carbo": "carbon fiber",
  "ju": "ju medichain",
  "wedding ck": "wedding cake",
  "wc": "wedding cake",
  "og kush": "og kush",
  "gsc": "girl scout cookies",
  "gsc (cookies)": "girl scout cookies",
  "mac1": "miracle alien cookies 1",
  "mac 1": "miracle alien cookies 1",
  "zkz": "zkittlez",
  "ak47": "ak 47",
  "ggg": "gorilla glue",
  "gg4": "gorilla glue 4",
  "gg #4": "gorilla glue 4",
  "gorilla glue #4": "gorilla glue 4",
  "bga": "blueberry auto",
  "wwa": "white widow auto",
  "gdp": "granddaddy purple",
  "granddaddy purps": "granddaddy purple",
  "cherry pie": "cherry pie",
  "la conf": "la confidential",
  "la confidential": "la confidential",
  "tahoe og": "tahoe og",
  "sour d": "sour diesel",
  "sour ds": "sour diesel",
  "nyc d": "new york city diesel",
  "mendo breath": "mendocino breath",
  "cali kush": "california kush",
  "cali og": "california og",

  // ── Grower-specific label normalization ──
  "מדיקיין (יום)": "medichain day",
  "מדיקיין (לילה)": "medichain night",
  "בזלת cbd": "basalt cbd",
  "שיח": "siach",

  // ── Category prefix stripping (T/C labels appear in product names) ──
  // These are handled in normalizeName(), not here
};

// ── Evidence strength codes ────────────────────────────────────
// T1 = high RCT evidence, T2 = moderate, T3 = low/observational
// Suffix _high / _emerging modifies the grade.
export const EVIDENCE_GRADES = {
  T1_high:     { label: "עדות חזקה",    weight: 1.0 },
  T1:          { label: "עדות גבוהה",   weight: 0.9 },
  T1_emerging: { label: "עדות מתפתחת",  weight: 0.75 },
  T2:          { label: "עדות בינונית", weight: 0.6 },
  T3:          { label: "עדות מוגבלת",  weight: 0.4 },
  T3_contested:{ label: "עדות שנויה במחלוקת", weight: 0.2 },
};

// ── Normalize a raw product/strain name string ─────────────────
// 1. Strip T/C category prefixes (e.g. "T22/C4 Wedding Cake" → "Wedding Cake")
// 2. Force lowercase
// 3. Unify whitespace and hyphens
// 4. Normalize lookalikes: 0↔O in strain names
export function normalizeName(raw = "") {
  if (typeof raw !== "string") return "";
  let s = raw.trim();

  // Strip leading T/C category codes
  s = s.replace(/^T\d+\/C\d+\s*/i, "");

  // Strip trailing category codes
  s = s.replace(/\s*T\d+\/C\d+\s*$/i, "");

  // Normalize 0/O lookalikes: isolated digit-zero surrounded by word chars → 'O'
  // e.g. "G0AT" → "GOAT", "OG K0sh" → "OG Kosh" — common OCR artefact
  s = s.replace(/(?<=[A-Za-z])0(?=[A-Za-z])/g, "o");

  // Collapse hyphens/underscores/multiple spaces to single space
  s = s.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();

  return s.toLowerCase();
}

// ── Translate raw string to canonical form ─────────────────────
// Returns { canonical: string, translated: boolean }
export function resolveCanonicalName(raw = "") {
  const normalized = normalizeName(raw);

  // Direct dictionary lookup
  if (TRANSLATION_DICT[raw.trim()]) {
    return { canonical: TRANSLATION_DICT[raw.trim()], translated: true };
  }
  if (TRANSLATION_DICT[normalized]) {
    return { canonical: TRANSLATION_DICT[normalized], translated: true };
  }

  // Partial prefix match (handles "Tehelet Day Edition" → "tehelet day")
  for (const [k, v] of Object.entries(TRANSLATION_DICT)) {
    if (normalized.startsWith(k.toLowerCase())) {
      return { canonical: v, translated: true };
    }
  }

  return { canonical: normalized, translated: false };
}

// ── Levenshtein distance (pure JS, no deps) ────────────────────
// Exported so menuParser.js can import this single implementation
// rather than duplicating the algorithm (DRY).
export function levenshteinDistance(a, b) {
  a = (a || '').toLowerCase();
  b = (b || '').toLowerCase();
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = Array.from({ length: n + 1 }, (_, j) => j);
  const curr = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    prev.splice(0, n + 1, ...curr);
  }
  return prev[n];
}

// Normalized similarity [0,1]: 1 = identical
function computeStringSimilarity(a, b) {
  const maxLen = Math.max((a || '').length, (b || '').length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

// ── Fuzzy match a query against a list of candidate objects ────
// candidates: Array<{ name: string, id: string, ...rest }>
// Returns array sorted by confidence desc, with confidence scores
export const FUZZY_THRESHOLD = 0.65;  // minimum similarity to be considered a match

export function fuzzyMatchCandidates(query, candidates, threshold = FUZZY_THRESHOLD) {
  const { canonical: qNorm } = resolveCanonicalName(query);

  return candidates
    .map((c) => {
      const { canonical: cNorm } = resolveCanonicalName(c.name || "");
      const exactAlias = (c.aliases || c.aka || [])
        .map((a) => normalizeName(a))
        .some((a) => a === qNorm);

      const sim = exactAlias ? 1.0 : Math.max(
        computeStringSimilarity(qNorm, cNorm),
        // Also try partial-name match for long genetics strings
        cNorm.includes(qNorm) ? 0.8 : 0,
        qNorm.includes(cNorm) && cNorm.length > 4 ? 0.75 : 0
      );

      return { ...c, _fuzzyScore: sim };
    })
    .filter((c) => c._fuzzyScore >= threshold)
    .sort((a, b) => b._fuzzyScore - a._fuzzyScore);
}

// ── Ambiguity Resolver ─────────────────────────────────────────
// If multiple candidates score above threshold with similar confidence
// → return needsUserSelection: true so the UI can prompt the user.
// NEVER silently pick one when two are too close to call.
const AMBIGUITY_GAP = 0.12;  // if top-2 scores differ by less than this → ambiguous

export function resolveAmbiguity(query, candidates) {
  const ranked = fuzzyMatchCandidates(query, candidates);

  if (!ranked.length) {
    return { match: null, needsUserSelection: false, candidates: [], confidence: 0 };
  }

  const top = ranked[0];

  if (ranked.length === 1) {
    return { match: top, needsUserSelection: false, candidates: ranked, confidence: top._fuzzyScore };
  }

  const second = ranked[1];
  const gap = top._fuzzyScore - second._fuzzyScore;

  if (gap < AMBIGUITY_GAP && second._fuzzyScore >= FUZZY_THRESHOLD) {
    // Too close — route to user selection
    return {
      match: null,
      needsUserSelection: true,
      candidates: ranked.slice(0, 4),
      confidence: top._fuzzyScore,
      message: `נמצאו מספר זנים דומים ל-"${query}". בחרו את הזן הנכון כדי לקבל ציון מדויק.`,
    };
  }

  return { match: top, needsUserSelection: false, candidates: ranked, confidence: top._fuzzyScore };
}

// ── Terpene source imputation ──────────────────────────────────
// Determines the terpene_source tier for a batch, given what we know.
// Returns: 'measured' | 'typical_from_genetics' | 'unknown'
export function imputeTerpeneSource({ hasMeasuredTerpenes, hasGeneticProfile, geneticConfidence }) {
  if (hasMeasuredTerpenes) return "measured";
  if (hasGeneticProfile && geneticConfidence !== "unresolved") return "typical_from_genetics";
  return "unknown";
}

// ── Normalize a full product catalog entry for DB insertion ────
export function normalizeProductEntry(raw) {
  const { canonical, translated } = resolveCanonicalName(raw.commercial_name || raw.name || "");
  return {
    commercial_name:      raw.commercial_name || raw.name || "",
    commercial_name_norm: canonical,
    producer:             (raw.producer || raw.grower || "").trim(),
    brand_label:          (raw.brand_label || "").trim() || null,
    cat_no:               (raw.cat_no || raw.cat || "").trim() || null,
    translated,
  };
}
