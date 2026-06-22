// Phase 4 — Condition → Recommendation Profile
//
// Each entry cross-references three sources:
//   1. MOH Procedure 106 treatment route (THC-rising / CBD-rising / balanced / CBD-rich)
//   2. Published clinical/research evidence on cannabis terpenes for that condition
//   3. App's accumulated strain data
//
// Confidence signal:
//   "strong"  — well-established in published literature + MOH route
//   "moderate"— MOH route + some evidence
//   "soft"    — limited/emerging evidence, use as gentle heuristic only
//
// ALL chemistry stays behind the scenes; only human-voice labels reach the UI.
// terpLean: terpene weights added to liveVector during scoring (never displayed raw)

export const CONDITION_PROFILES = {
  // ── Pain ──────────────────────────────────────────────────────────────────
  chronic_pain: {
    route:      "thc_rising",      // T10/C2 → T22/C4
    confidence: "strong",
    terpLean:   { caryophyllene: 1.4, myrcene: 1.1, humulene: 0.8 },
    goalBias:   ["relax", "pain_relief"],
    timing:     "evening",
    note:       "כאב כרוני — מסלול THC עולה; קריופילן ומירצן מובילים למקל כאב",
  },
  neuropathic: {
    route:      "thc_rising",
    confidence: "moderate",
    terpLean:   { caryophyllene: 1.3, linalool: 0.9, myrcene: 0.8 },
    goalBias:   ["pain_relief", "relax"],
    timing:     "evening",
    note:       "כאב עצבי — קריופילן כנגד-דלקתי; לינלול מרגיע",
  },

  // ── Oncology / nausea ─────────────────────────────────────────────────────
  oncology: {
    route:      "thc_rising",
    confidence: "strong",
    terpLean:   { myrcene: 1.2, limonene: 0.9, caryophyllene: 0.7 },
    goalBias:   ["pain_relief", "mood", "appetite"],
    timing:     "any",
    note:       "אונקולוגיה — מסלול THC עולה; ליפון מרים מצב רוח, מירצן מרגיע",
  },
  nausea_vomiting: {
    route:      "thc_rising",
    confidence: "moderate",
    terpLean:   { limonene: 1.2, terpinolene: 0.7, myrcene: 0.6 },
    goalBias:   ["mood", "relax"],
    timing:     "any",
    note:       "בחילות — ליפון ידוע כנגד-בחילות; THC נמוך-בינוני מתאים",
  },

  // ── IBD / GI ──────────────────────────────────────────────────────────────
  ibd: {
    route:      "cbd_rising",      // T5/C10 → T0/C26
    confidence: "moderate",
    terpLean:   { caryophyllene: 1.3, myrcene: 0.8, humulene: 0.7 },
    goalBias:   ["relax", "pain_relief"],
    timing:     "any",
    note:       "קרוהן/קוליטיס — מסלול CBD עולה; קריופילן כ-CB2 אגוניסט",
  },

  // ── Neurological ──────────────────────────────────────────────────────────
  ms: {
    route:      "cbd_rising",
    confidence: "moderate",
    terpLean:   { myrcene: 1.0, linalool: 0.9, caryophyllene: 0.8 },
    goalBias:   ["relax", "pain_relief", "sleep"],
    timing:     "evening",
    note:       "טרשת נפוצה — CBD עולה; מירצן + לינלול לספסטיות ושינה",
  },
  parkinsons: {
    route:      "thc_rising",
    confidence: "moderate",
    terpLean:   { linalool: 1.1, limonene: 0.9, myrcene: 0.8 },
    goalBias:   ["relax", "sleep", "mood"],
    timing:     "evening",
    note:       "פרקינסון — מסלול THC עולה; לינלול נוירו-הגנתי, ליפון תומך",
  },
  epilepsy: {
    route:      "cbd_rich",        // T0/C26, T1/C22, T3/C18
    confidence: "strong",
    terpLean:   { linalool: 1.4, myrcene: 0.8, caryophyllene: 0.5 },
    goalBias:   ["relax", "sleep"],
    timing:     "any",
    note:       "אפילפסיה — CBD גבוה מאוד; לינלול מפחית עוצמת התקפים במחקרים",
  },
  tourette: {
    route:      "thc_rising",
    confidence: "moderate",
    terpLean:   { myrcene: 1.1, linalool: 0.9, caryophyllene: 0.6 },
    goalBias:   ["relax", "sleep"],
    timing:     "any",
    note:       "טורט — מסלול THC עולה; מירצן + לינלול לטיקים ולחרדה",
  },

  // ── Psychiatric ───────────────────────────────────────────────────────────
  ptsd: {
    route:      "balanced",        // T10/C10
    confidence: "strong",
    terpLean:   { linalool: 1.3, limonene: 1.0, caryophyllene: 0.7 },
    goalBias:   ["relax", "sleep", "mood"],
    timing:     "evening",
    note:       "PTSD — מאוזן T10/C10; לינלול+ליפון להפחתת חרדה, שינה",
  },
  autism: {
    route:      "cbd_rich",
    confidence: "moderate",
    terpLean:   { linalool: 1.2, myrcene: 0.9, limonene: 0.7 },
    goalBias:   ["relax", "sleep", "mood"],
    timing:     "any",
    note:       "אוטיזם — CBD עשיר; לינלול + מירצן לרוגע, שינה, ויסות",
  },

  // ── Other chronic ─────────────────────────────────────────────────────────
  fibromyalgia: {
    route:      "thc_rising",
    confidence: "moderate",
    terpLean:   { myrcene: 1.2, caryophyllene: 1.0, linalool: 0.8 },
    goalBias:   ["pain_relief", "relax", "sleep"],
    timing:     "evening",
    note:       "פיברומיאלגיה — מסלול THC עולה; מירצן + קריופילן לכאב ושינה",
  },
  aids: {
    route:      "cbd_rising",
    confidence: "soft",
    terpLean:   { myrcene: 1.0, limonene: 0.8, caryophyllene: 0.7 },
    goalBias:   ["appetite", "relax", "mood"],
    timing:     "any",
    note:       "HIV/AIDS — CBD עולה; מירצן + ליפון לתיאבון ומצב רוח",
  },
  glaucoma: {
    route:      "thc_rising",
    confidence: "soft",
    terpLean:   { myrcene: 0.9, caryophyllene: 0.7 },
    goalBias:   ["relax"],
    timing:     "any",
    note:       "גלאוקומה — THC מוריד לחץ תוך-עיני; אפקט קצר-טווח",
  },
  dementia: {
    route:      "balanced",
    confidence: "soft",
    terpLean:   { linalool: 1.1, limonene: 0.9, myrcene: 0.8 },
    goalBias:   ["relax", "sleep"],
    timing:     "evening",
    note:       "דמנציה — מאוזן; לינלול + ליפון להפחתת תסיסה ולשינה",
  },
  palliative: {
    route:      "thc_rising",
    confidence: "strong",
    terpLean:   { myrcene: 1.3, linalool: 1.0, caryophyllene: 0.9 },
    goalBias:   ["pain_relief", "sleep", "relax"],
    timing:     "any",
    note:       "פליאטיבי — מסלול THC; מירצן + לינלול לנוחות ושינה",
  },
  heart_failure: {
    route:      "cbd_rising",
    confidence: "soft",
    terpLean:   { linalool: 1.0, myrcene: 0.8 },
    goalBias:   ["relax", "sleep"],
    timing:     "evening",
    note:       "אי-ספיקת לב — שמרנות; CBD עולה, לינלול מרגיע",
  },
  other: {
    route:      "balanced",
    confidence: "soft",
    terpLean:   {},
    goalBias:   [],
    timing:     "any",
    note:       "מצב חריג — ייעוץ מרופא הקנאביס לפני התחלה",
  },
};

export default CONDITION_PROFILES;
