// ─────────────────────────────────────────────────────────────────────────────
//  Frontend-safe copy of the onboarding data constants.
//  These are pure data objects with zero Node.js dependencies.
//
//  Source of truth for the shape lives in:
//    api/lib/clinicalCore.js   (CLINICAL_MAP)
//    api/lib/onboardingVector.js (FLAVOR_TERP_MAP, LEGACY_GENETICS)
//
//  If you change values here you MUST mirror the change in the api/ originals
//  so the backend scoring stays in sync with what the wizard shows the user.
// ─────────────────────────────────────────────────────────────────────────────

// ── Clinical indication map ───────────────────────────────────────────────────
// kill_switch: terpenes that immediately zero a strain's score for this indication
export const CLINICAL_MAP = {
  ptsd: {
    label_he: "פוסט-טראומה",
    positive_lineages: ["Kush", "Purple", "OG"],
    positive_terpenes: ["linalool", "myrcene", "caryophyllene"],
    kill_switch: ["terpinolene", "pinene"],
    preferred_categories: ["T15/C3", "T12/C12", "T10/C10"],
    evidence: "T3_contested",
    regulatory_warning: "המועצה הלאומית ל-PTSD המליצה נגד. הצג שני צדדים, הפנה לרופא.",
  },
  anxiety: {
    label_he: "חרדה",
    positive_lineages: ["Cookies", "Kush"],
    positive_terpenes: ["limonene", "linalool", "caryophyllene"],
    kill_switch: ["terpinolene"],
    preferred_categories: ["T1/C22", "T3/C15", "T10/C10"],
    evidence: "T1",
  },
  chronic_pain: {
    label_he: "כאב נוירופתי כרוני",
    positive_lineages: ["Diesel", "Chemdawg", "OG", "Kush"],
    positive_terpenes: ["caryophyllene", "myrcene", "humulene"],
    kill_switch: [],
    preferred_categories: ["T22/C4", "T18/C3", "T15/C3"],
    evidence: "T2",
  },
  fibromyalgia: {
    label_he: "פיברומיאלגיה",
    positive_lineages: ["Kush", "OG"],
    positive_terpenes: ["caryophyllene", "myrcene", "linalool"],
    kill_switch: [],
    preferred_categories: ["T15/C3", "T12/C12"],
    evidence: "T3",
  },
  endometriosis: {
    label_he: "אנדומטריוזיס",
    positive_lineages: ["Kush", "Cookies"],
    positive_terpenes: ["caryophyllene", "myrcene"],
    kill_switch: [],
    preferred_categories: ["T15/C3", "T10/C10"],
    evidence: "T3",
  },
  oncology: {
    label_he: "אונקולוגיה",
    positive_lineages: ["OG", "Kush", "Diesel"],
    positive_terpenes: ["myrcene", "limonene", "caryophyllene"],
    kill_switch: [],
    preferred_categories: ["T22/C4", "T18/C3"],
    evidence: "T2",
  },
  palliative: {
    label_he: "טיפול פליאטיבי",
    positive_lineages: ["Kush", "OG", "Cookies"],
    positive_terpenes: ["myrcene", "caryophyllene", "linalool"],
    kill_switch: [],
    preferred_categories: ["T22/C4", "T20/C4", "T15/C3"],
    evidence: "T2",
  },
  crohns: {
    label_he: "קרוהן",
    positive_lineages: ["Kush", "Cookies"],
    positive_terpenes: ["caryophyllene", "myrcene", "humulene"],
    kill_switch: [],
    preferred_categories: ["T15/C3", "T10/C10", "T1/C22"],
    evidence: "T1_emerging",
  },
  colitis: {
    label_he: "קוליטיס כיבית",
    positive_lineages: ["Kush", "Cookies"],
    positive_terpenes: ["caryophyllene", "humulene"],
    kill_switch: [],
    preferred_categories: ["T15/C3", "T1/C22", "T0/C26"],
    evidence: "T1_emerging",
  },
  ms: {
    label_he: "טרשת נפוצה",
    positive_lineages: ["Kush", "OG"],
    positive_terpenes: ["caryophyllene", "myrcene", "linalool"],
    kill_switch: [],
    preferred_categories: ["T10/C10", "T12/C12", "T8/C8"],
    evidence: "T2",
  },
  parkinsons: {
    label_he: "פרקינסון",
    positive_lineages: ["Kush"],
    positive_terpenes: ["linalool", "myrcene", "caryophyllene"],
    kill_switch: [],
    preferred_categories: ["T10/C10", "T3/C15"],
    evidence: "T3",
  },
  tourette: {
    label_he: "תסמונת טורט",
    positive_lineages: ["Kush", "OG"],
    positive_terpenes: ["linalool", "myrcene"],
    kill_switch: [],
    preferred_categories: ["T15/C3", "T10/C2"],
    evidence: "T3",
  },
  epilepsy: {
    label_he: "אפילפסיה עמידה",
    positive_lineages: ["CBD-rich"],
    positive_terpenes: ["linalool"],
    kill_switch: [],
    preferred_categories: ["T0/C26", "T1/C22", "T3/C18"],
    evidence: "T1_high",
  },
  autism: {
    label_he: "אוטיזם (ASD)",
    positive_lineages: ["CBD-rich"],
    positive_terpenes: ["linalool", "myrcene"],
    kill_switch: ["terpinolene", "pinene"],
    preferred_categories: ["T0/C26", "T1/C22"],
    evidence: "T3",
    regulatory_warning: "התוויה רגישה (כולל קטינים). חובת מומחה.",
  },
  hiv_wasting: {
    label_he: "תסמונת כחיון (HIV)",
    positive_lineages: ["OG", "Diesel"],
    positive_terpenes: ["myrcene", "limonene"],
    kill_switch: [],
    preferred_categories: ["T22/C4", "T18/C3"],
    evidence: "T2",
  },
  glaucoma: {
    label_he: "גלאוקומה",
    positive_lineages: ["OG", "Kush"],
    positive_terpenes: ["myrcene", "caryophyllene"],
    kill_switch: [],
    preferred_categories: ["T15/C3", "T10/C2"],
    evidence: "T3",
  },
};

// ── Sensory flavour → terpene weight contributions ────────────────────────────
export const FLAVOR_TERP_MAP = {
  gas_fuel:        { caryophyllene: 1.3, myrcene: 0.8, humulene: 0.5 },
  citrus_sharp:    { limonene: 1.6, pinene: 0.5, terpinolene: 0.3 },
  earthy_musky:    { myrcene: 1.4, humulene: 0.8, caryophyllene: 0.4 },
  sweet_berry:     { linalool: 1.0, limonene: 0.8, myrcene: 0.5 },
  pine_fresh:      { pinene: 1.6, terpinolene: 0.6, ocimene: 0.3 },
  floral_lavender: { linalool: 1.5, terpinolene: 0.5, ocimene: 0.4 },
  spicy_pepper:    { caryophyllene: 1.6, humulene: 0.6, myrcene: 0.3 },
  tropical_mango:  { myrcene: 1.1, ocimene: 0.9, limonene: 0.7 },
};

// ── Iconic parent genetics → terpene profiles (Stage 4 heritage mapping) ──────
export const LEGACY_GENETICS = {
  kush:     { myrcene: 1.3, caryophyllene: 0.9, linalool: 0.7, humulene: 0.3 },
  haze:     { terpinolene: 1.1, limonene: 0.9, pinene: 0.7, ocimene: 0.4 },
  diesel:   { caryophyllene: 1.1, myrcene: 0.8, limonene: 0.7, terpinolene: 0.3 },
  cookies:  { caryophyllene: 1.2, limonene: 0.9, linalool: 0.7, humulene: 0.4 },
  purple:   { myrcene: 1.4, linalool: 1.0, caryophyllene: 0.5, pinene: 0.2 },
  og:       { myrcene: 1.1, caryophyllene: 0.9, limonene: 0.7, linalool: 0.4 },
  gelato:   { limonene: 1.1, linalool: 0.9, caryophyllene: 0.8, myrcene: 0.4 },
  runtz:    { limonene: 1.2, linalool: 0.8, myrcene: 0.6, caryophyllene: 0.4 },
  chemdawg: { caryophyllene: 1.4, myrcene: 0.8, limonene: 0.6, humulene: 0.5 },
  zkittlez: { limonene: 1.3, linalool: 0.8, myrcene: 0.6, ocimene: 0.3 },
};
