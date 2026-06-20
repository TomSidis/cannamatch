// ─────────────────────────────────────────────────────────────
//  קנאמאצ׳ — Adaptive Weight Scoring Engine (v2)
//
//  פילוסופיה: הגנטיקה היא האמת. הציון = "כמה זה מתאים להיסטוריה שלך"
//  NEVER "הסתברות לריפוי קליני".
//
//  מטריצת משקלים אדפטיבית לפי שלמות נתונים:
//  ┌─────────────────────────────┬─────────┬──────────────────────┬────────────────────┐
//  │ רכיב                        │ Terp=?  │ Terp✓ + Gen!verified │ Terp✓ + Gen verified│
//  ├─────────────────────────────┼─────────┼──────────────────────┼────────────────────┤
//  │ גנטיקה                      │  25%    │         10%          │        45%         │
//  │ קנאבינואידים / קטגוריה      │  50%    │         15%          │        15%         │
//  │ טרפנים + טריגרים            │   0%    │         55%          │        25%         │
//  │ סנטימנט קהילתי              │  25%    │         20%          │        15%         │
//  └─────────────────────────────┴─────────┴──────────────────────┴────────────────────┘
//
//  טרפנים חסרים: מוסתרים לחלוטין (לא מחושבים כאפס).
//  Shrinkage: ציון מתכווץ לכיוון בסיס נייטרלי (72%) כש-data_confidence נמוך.
// ─────────────────────────────────────────────────────────────

import { CLINICAL_MAP } from "./clinicalCore.js";

// ── Terpene index in the 12-dim embedding vector ──────────────
export const TERP_IDX = {
  myrcene: 4, limonene: 5, caryophyllene: 6, linalool: 7,
  pinene: 8, humulene: 9, terpinolene: 10, ocimene: 11,
};

const GENETIC_FAMILIES = ["Kush","Cookies","Diesel","Chemdawg","Haze","Gelato","OG","Purple","Zkittlez","Runtz"];

export const TRIGGER_THRESHOLD = 0.15;
const PROFILE_LEARNING_RATE  = 0.15;
const CHECKIN_LEARNING_RATE  = 0.08;
const TRIGGER_PENALTY  = 1.0;
const DOMINANT_TERP_MIN = 0.10;
const SHRINKAGE_BASELINE = 72; // percent — neutral anchor for low-confidence scores

// ── Adaptive weight scenarios ─────────────────────────────────
const WEIGHT_MATRIX = {
  terpenes_unknown: {
    genetics:     0.25,
    cannabinoids: 0.50,
    terpenes:     0.00,  // masked — never calculated as zero
    community:    0.25,
  },
  terpenes_genetics_unresolved: {
    genetics:     0.10,
    cannabinoids: 0.15,
    terpenes:     0.55,
    community:    0.20,
  },
  terpenes_genetics_verified: {
    genetics:     0.45,
    cannabinoids: 0.15,
    terpenes:     0.25,
    community:    0.15,
  },
};

const clamp01 = (x) => Math.max(0, Math.min(1, x));

export function cosine(a, b) {
  if (!a?.length || !b?.length) return 0;
  let d = 0, na = 0, nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) { d += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
  return (na && nb) ? d / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

export function lineageFamilies(lineage = "") {
  const l = lineage.toLowerCase();
  return GENETIC_FAMILIES.filter((f) => l.includes(f.toLowerCase()));
}

function computeTerpeneTotal(sv) {
  return sv.reduce((s, x, i) => (i >= 4 ? s + x : s), 0) || 1;
}

export function dominantTerps(embedding, total) {
  return Object.entries(TERP_IDX)
    .filter(([, i]) => (embedding[i] || 0) / total >= DOMINANT_TERP_MIN)
    .map(([name, i]) => [name, (embedding[i] || 0) / total]);
}

// ── Determine scoring scenario from batch metadata ─────────────
function detectWeightingScenario(terpeneSource, geneticConfidence) {
  if (!terpeneSource || terpeneSource === "unknown") return "terpenes_unknown";
  if (geneticConfidence === "verified" || geneticConfidence === "grower") {
    return "terpenes_genetics_verified";
  }
  return "terpenes_genetics_unresolved";
}

// ── Score shrinkage: pull low-confidence scores toward neutral ──
function applyConfidenceShrinkage(rawScorePct, dataConfidence) {
  if (dataConfidence >= 1.0) return rawScorePct;
  const conf = clamp01(dataConfidence);
  return Math.round(rawScorePct * conf + SHRINKAGE_BASELINE * (1 - conf));
}

// ── Category (cannabinoid) match score ────────────────────────
// Compares strain category against user's clinically-preferred categories.
// Returns [0,1]: 1.0 = exact match, 0.5 = same group, 0.2 = mismatch.
function computeCannabinoidScore(strainCat, userDNA) {
  if (!strainCat) return 0.5;

  const indications = userDNA.indications || [];
  if (!indications.length) return 0.5;

  const preferred = new Set();
  const sameGroup = new Set();

  // THC-rich group
  const thcGroup = new Set(["T22/C4","T18/C3","T15/C3","T12/C2","T10/C2"]);
  // Balanced group
  const balGroup = new Set(["T12/C12","T10/C10","T8/C8","T5/C5","T1/C1"]);
  // CBD-rich group
  const cbdGroup = new Set(["T0/C26","T1/C22","T3/C18","T3/C15","T3/C12","T5/C10"]);

  const groupOf = (cat) => {
    if (thcGroup.has(cat)) return "thc";
    if (balGroup.has(cat)) return "balanced";
    if (cbdGroup.has(cat)) return "cbd";
    return "unknown";
  };

  for (const ind of indications) {
    const map = CLINICAL_MAP[ind];
    if (!map) continue;
    (map.preferred_categories || []).forEach((c) => {
      preferred.add(c);
      sameGroup.add(groupOf(c));
    });
  }

  if (preferred.has(strainCat)) return 1.0;

  const strainGroup = groupOf(strainCat);
  if (sameGroup.has(strainGroup)) return 0.5;

  return 0.2;
}

// ── Core genetics match component ─────────────────────────────
function computeGeneticsScore(strain, userDNA) {
  const fams = lineageFamilies(strain.lineage || "");
  const tg = userDNA.target_genetics || {};
  const maxG = Math.max(1, ...Object.values(tg));

  if (!fams.length) return 0.3; // no lineage data — neutral prior

  const raw = fams.reduce((s, f) => s + (tg[f] || 0), 0) / (fams.length * maxG);
  return clamp01(raw || 0.3);
}

// ── Core terpene match component (masked when unknown) ─────────
// Returns null if terpene data is unavailable (caller MUST check for null).
function computeTerpeneScore(sv, userDNA) {
  if (!sv || sv.length < 12) return null;

  const total = computeTerpeneTotal(sv);
  let penalty = 0;
  for (const [terp, w] of Object.entries(userDNA.trigger_terpenes || {})) {
    const frac = (sv[TERP_IDX[terp]] || 0) / total;
    penalty += frac * w;
  }
  const raw = clamp01(cosine(sv, userDNA.target_vector || []) - penalty);
  return raw;
}

// ── Kill-switch block: runs BEFORE any scoring ─────────────────
// Returns { blocked: true, flag, companion_message } or { blocked: false }
export function runKillSwitch(sv, userDNA) {
  const indications = userDNA.indications || [];
  if (!sv || sv.length < 12) return { blocked: false };

  const total = computeTerpeneTotal(sv);

  for (const ind of indications) {
    const map = CLINICAL_MAP[ind];
    if (!map) continue;
    for (const trig of map.kill_switch || []) {
      const frac = (sv[TERP_IDX[trig]] || 0) / total;
      if (frac >= TRIGGER_THRESHOLD) {
        const TERP_HE = { terpinolene: "טרפינולן", pinene: "פינן",
                         limonene: "לימונן", caryophyllene: "קריופילן" };
        return {
          blocked: true,
          score_override: 0,
          flag: `kill_${trig}_for_${ind}`,
          indication: map.label_he,
          trigger: TERP_HE[trig] || trig,
          companion_message:
            `רגע, עצור! 🛑 הזן הזה עמוס ב${TERP_HE[trig] || trig} — וזה בדיוק מה ` +
            `שמדליק לך את ה${map.label_he}. חסמתי אותו בשבילך. הלב שלך יודה לי אחר כך. 💚`,
        };
      }
    }
  }

  // User-level trigger terpenes (from prior bad reactions, weight >= 0.9)
  for (const [terp, w] of Object.entries(userDNA.trigger_terpenes || {})) {
    const frac = (sv[TERP_IDX[terp]] || 0) / total;
    if (w >= 0.9 && frac >= TRIGGER_THRESHOLD) {
      return {
        blocked: true,
        score_override: 0,
        flag: `user_trigger_${terp}`,
        trigger: terp,
        companion_message: `הזן הזה מכיל ${terp} בכמות גבוהה — ואתה הגדרת אותו כטריגר שלילי מהניסיון שלך. חסמתי אותו. 🛡️`,
      };
    }
  }

  return { blocked: false };
}

// ── Full scoring with explanation object ──────────────────────
/**
 * calculateMatchScoreWithExplanation
 *
 * @param {object} userDNA        - from user_dna_profiles.profile
 * @param {object} strain         - { lineage, embedding:[12], category, genetic_confidence? }
 * @param {number} community      - 0-1 community sentiment score
 * @param {object} batchMeta      - { terpene_source, data_confidence, genetic_confidence }
 * @returns {{ score: number, explanation: object }}
 */
export function calculateMatchScoreWithExplanation(userDNA, strain, community = 0.5, batchMeta = {}) {
  const sv = strain.embedding;
  const strainCat = strain.cat || strain.category;
  const terpSrc  = batchMeta.terpene_source  || strain.terpene_source  || "unknown";
  const dataConf = batchMeta.data_confidence != null
    ? batchMeta.data_confidence
    : (strain.confidence_score ?? 0.5);
  const genConf  = batchMeta.genetic_confidence || strain.genetic_confidence || "unverified";

  // ── Kill-switch block ─────────────────────────────────────────
  const ks = runKillSwitch(sv, userDNA);
  if (ks.blocked) {
    return {
      score: 0,
      explanation: {
        scenario: "kill_switch",
        kill_switch: ks,
        data_confidence: dataConf,
        shrinkage_applied: false,
        final_score: 0,
      },
    };
  }

  // ── Determine scenario ────────────────────────────────────────
  const scenario = detectWeightingScenario(terpSrc, genConf);
  const weights  = WEIGHT_MATRIX[scenario];

  // ── Individual component scores ───────────────────────────────
  const gScore  = computeGeneticsScore(strain, userDNA);
  const cScore  = computeCannabinoidScore(strainCat, userDNA);
  const tScore  = (scenario === "terpenes_unknown") ? null : computeTerpeneScore(sv, userDNA);
  const sScore  = clamp01(community);

  // ── Weighted composite (terpenes masked when null) ────────────
  let composite;
  if (tScore === null) {
    // Redistribute terpene weight to remaining components proportionally
    const totalW = weights.genetics + weights.cannabinoids + weights.community;
    composite = totalW > 0
      ? (gScore * weights.genetics + cScore * weights.cannabinoids + sScore * weights.community) / totalW
      : 0;
  } else {
    composite = gScore * weights.genetics
              + cScore * weights.cannabinoids
              + tScore * weights.terpenes
              + sScore * weights.community;
  }

  const rawPct     = Math.round(clamp01(composite) * 100);
  const finalScore = applyConfidenceShrinkage(rawPct, dataConf);

  return {
    score: finalScore,
    explanation: {
      scenario,
      weights,
      components: {
        genetics:     { raw: gScore,  weighted: +(gScore  * weights.genetics).toFixed(3),     source: "lineage_families"  },
        cannabinoids: { raw: cScore,  weighted: +(cScore  * weights.cannabinoids).toFixed(3), source: "category_match"    },
        terpenes:     { raw: tScore,  weighted: tScore === null ? 0 : +(tScore * weights.terpenes).toFixed(3),
                        source: tScore === null ? "masked_unknown" : `from_${terpSrc}` },
        community:    { raw: sScore,  weighted: +(sScore  * weights.community).toFixed(3),    source: "community_reviews" },
      },
      shrinkage_applied:  dataConf < 1.0,
      shrinkage_baseline: SHRINKAGE_BASELINE,
      data_confidence:    dataConf,
      kill_switch:        null,
      final_score:        finalScore,
    },
  };
}

// ── Backward-compatible entry point ───────────────────────────
export function calculateMatchScore(userDNA, strain, community = 0.5, batchMeta = {}) {
  return calculateMatchScoreWithExplanation(userDNA, strain, community, batchMeta).score;
}

// ── Derive blocked trigger list from trigger_terpenes map ──────
export function deriveBlockedTriggers(triggerTerpenes) {
  return Object.entries(triggerTerpenes || {})
    .filter(([, w]) => w >= TRIGGER_THRESHOLD)
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t);
}

// ── Bayesian-style DNA profile update from full review ─────────
export function updateUserDNAProfile(profile, strain, feedback) {
  const p = structuredClone(profile);
  p.target_genetics  ||= {};
  p.target_terpenes  ||= {};
  p.trigger_terpenes ||= {};
  p.indications      ||= [];

  const sv    = strain.embedding;
  const total = sv ? computeTerpeneTotal(sv) : 1;
  const terps = sv ? dominantTerps(sv, total) : [];
  const fams  = lineageFamilies(strain.lineage || "");

  if (feedback.indication && !p.indications.includes(feedback.indication)) {
    p.indications.push(feedback.indication);
  }

  if (feedback.anxietyTriggered) {
    // Hard negative: push dominant terpenes to trigger list immediately
    for (const [t] of terps) p.trigger_terpenes[t] = TRIGGER_PENALTY;
    for (const f of fams)
      p.target_genetics[f] = Math.max(0, (p.target_genetics[f] || 0) - PROFILE_LEARNING_RATE);
  } else {
    const pos = ((feedback.efficacy || 0) + (feedback.painRelief || 0) + (feedback.sleepQuality || 0)) / 15;

    if (pos > 0.4) {
      // Strong positive: converge toward this strain's terpene/genetic profile
      for (const [t, frac] of terps)
        p.target_terpenes[t] = clamp01((p.target_terpenes[t] || 0) + PROFILE_LEARNING_RATE * pos * (0.5 + frac));
      for (const f of fams)
        p.target_genetics[f] = clamp01((p.target_genetics[f] || 0) + PROFILE_LEARNING_RATE * pos);
    } else if (pos < 0.25) {
      // Weak/negative: slight decay, not a full block
      for (const [t] of terps)
        p.target_terpenes[t] = clamp01((p.target_terpenes[t] || 0) - PROFILE_LEARNING_RATE * 0.4);
    }
  }

  // Rebuild target_vector from terpene weights
  p.target_vector = [...(p.target_vector || new Array(12).fill(0))];
  for (const [t, w] of Object.entries(p.target_terpenes))
    if (TERP_IDX[t] != null) p.target_vector[TERP_IDX[t]] = w;

  p.blocked_triggers = deriveBlockedTriggers(p.trigger_terpenes);
  p.report_count     = (p.report_count || 0) + 1;
  p.updated_at       = new Date().toISOString();
  return p;
}

// ── Update from bio-journal entry (richer signal than full review) ──
export function updateDNAFromJournal(profile, strain, journalEntry) {
  // Convert journal fields to review-compatible feedback object
  const feedback = {
    efficacy:        journalEntry.mood        || 3,
    painRelief:      journalEntry.pain_relief  || 3,
    sleepQuality:    journalEntry.sleep_quality || 3,
    anxietyTriggered: (journalEntry.anxiety_level || 1) >= 4,
    indication:      null,
  };
  return updateUserDNAProfile(profile, strain, feedback);
}

// ── Light daily check-in adjustment ───────────────────────────
export function applyCheckin(profile, dimension, value) {
  const p = structuredClone(profile);
  p.target_terpenes  ||= {};
  p.trigger_terpenes ||= {};

  if (dimension === "mood") {
    if (value === "anxious") {
      p.target_terpenes.linalool      = clamp01((p.target_terpenes.linalool    || 0) + CHECKIN_LEARNING_RATE);
      p.target_terpenes.limonene      = clamp01((p.target_terpenes.limonene    || 0) + CHECKIN_LEARNING_RATE * 0.5);
      p.trigger_terpenes.terpinolene  = Math.max(p.trigger_terpenes.terpinolene || 0, 0.6);
    } else if (value === "calm") {
      p.target_terpenes.linalool      = clamp01((p.target_terpenes.linalool    || 0) + CHECKIN_LEARNING_RATE * 0.3);
    }
  } else if (dimension === "pain") {
    if (value === "high") {
      p.target_terpenes.caryophyllene = clamp01((p.target_terpenes.caryophyllene || 0) + CHECKIN_LEARNING_RATE);
      p.target_terpenes.myrcene       = clamp01((p.target_terpenes.myrcene       || 0) + CHECKIN_LEARNING_RATE * 0.6);
    }
  } else if (dimension === "sleep") {
    if (value === "poor") {
      p.target_terpenes.myrcene       = clamp01((p.target_terpenes.myrcene       || 0) + CHECKIN_LEARNING_RATE * 0.8);
      p.target_terpenes.linalool      = clamp01((p.target_terpenes.linalool      || 0) + CHECKIN_LEARNING_RATE * 0.6);
    }
  }

  p.target_vector = [...(p.target_vector || new Array(12).fill(0))];
  for (const [t, w] of Object.entries(p.target_terpenes))
    if (TERP_IDX[t] != null) p.target_vector[TERP_IDX[t]] = w;

  p.blocked_triggers = deriveBlockedTriggers(p.trigger_terpenes);
  p.last_checkin = { dimension, value, at: new Date().toISOString() };
  return p;
}
