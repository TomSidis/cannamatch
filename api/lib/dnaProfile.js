// ─────────────────────────────────────────────────────────────
//  CannaMatch — DNA Profile Mutations + Embedding Math
//
//  Responsibilities:
//    • Bayesian-style DNA profile updates from reviews, journal entries
//      and daily check-ins (updateUserDNAProfile, updateDNAFromJournal,
//      applyCheckin)
//    • Shared embedding utilities used by the legacy 12-dim vector layer
//      (TERP_IDX, cosine, lineageFamilies, dominantTerps)
//
//  NOT responsible for match scoring — all scoring routes call
//  bridgeScore → scorer.ts (Engine 2, three-layer model).
// ─────────────────────────────────────────────────────────────

// ── Terpene index in the 12-dim embedding vector ──────────────
export const TERP_IDX = {
  myrcene: 4, limonene: 5, caryophyllene: 6, linalool: 7,
  pinene: 8, humulene: 9, terpinolene: 10, ocimene: 11,
};

const GENETIC_FAMILIES = ["Kush","Cookies","Diesel","Chemdawg","Haze","Gelato","OG","Purple","Zkittlez","Runtz"];

// Weight threshold: a terpene becomes a "blocked trigger" when the user's negative
// reaction weight reaches this level.  Semantically distinct from the kill-switch
// fraction threshold (getKillSwitchThreshold) — do NOT merge these two concepts.
const TRIGGER_WEIGHT_MIN    = 0.15;
const PROFILE_LEARNING_RATE = 0.15;
const CHECKIN_LEARNING_RATE = 0.08;
const TRIGGER_PENALTY       = 1.0;
const DOMINANT_TERP_MIN     = 0.10;

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

// ── Derive blocked trigger list from trigger_terpenes map ──────
export function deriveBlockedTriggers(triggerTerpenes) {
  return Object.entries(triggerTerpenes || {})
    .filter(([, w]) => w >= TRIGGER_WEIGHT_MIN)
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
    efficacy:         journalEntry.mood         || 3,
    painRelief:       journalEntry.pain_relief   || 3,
    sleepQuality:     journalEntry.sleep_quality || 3,
    anxietyTriggered: (journalEntry.anxiety_level || 1) >= 4,
    indication:       null,
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
