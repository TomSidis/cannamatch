// ─────────────────────────────────────────────────────────────────────────────
//  CannaMatch — Onboarding → pgvector Math Bridge
//
//  Takes the 5-stage onboarding payload and emits:
//    • target_vector  float[12]  — ready for pgvector cosine matching
//    • trigger_terpenes {}        — kill-switch map for clinical safety
//    • full DNA profile object    — ready for INSERT into user_dna_profiles
//
//  12-dim vector layout (mirrors seedStrains.js exactly):
//    [0] thc          — normalized (THC% / 30)
//    [1] cbd          — normalized (CBD% / 30)
//    [2] cbg          — minor cannabinoid (fixed 0.05 baseline)
//    [3] cbn          — minor cannabinoid (fixed 0.05 baseline)
//    [4] myrcene
//    [5] limonene
//    [6] caryophyllene
//    [7] linalool
//    [8] pinene
//    [9] humulene
//   [10] terpinolene
//   [11] ocimene
// ─────────────────────────────────────────────────────────────────────────────

import { CLINICAL_MAP } from "./clinicalCore.js";

const TERP_IDX = {
  myrcene: 4, limonene: 5, caryophyllene: 6, linalool: 7,
  pinene: 8, humulene: 9, terpinolene: 10, ocimene: 11,
};

// Sensory flavor → terpene weight contributions
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

// Iconic parent genetics → terpene profiles (for Stage 4 heritage mapping)
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

// THC tolerance → cannabinoid dims [thc, cbd]
const TOLERANCE_CANNABINOIDS = {
  new:     { thc: 0.20, cbd: 0.65 },
  medium:  { thc: 0.52, cbd: 0.38 },
  veteran: { thc: 0.80, cbd: 0.18 },
};

// Primary goal → terpene boosts
const GOAL_BOOSTS = {
  focus:       { pinene: 0.9, limonene: 0.7, terpinolene: 0.4 },
  relax:       { linalool: 0.9, myrcene: 0.7, caryophyllene: 0.4 },
  sleep:       { myrcene: 1.1, linalool: 0.9, caryophyllene: 0.3 },
  pain_relief: { caryophyllene: 1.1, myrcene: 0.8, humulene: 0.4 },
  mood:        { limonene: 1.1, linalool: 0.6, terpinolene: 0.3 },
};

/**
 * buildOnboardingVector — core math transform
 * @param {object} payload — the 5-stage wizard payload
 * @returns {{ targetVector: number[], killSwitches: object }}
 */
function buildOnboardingVector(payload) {
  const vec = new Array(12).fill(0);
  const killSwitches = {};

  // ── Stage 1: THC tolerance → cannabinoid dims ─────────────────────────────
  const cann = TOLERANCE_CANNABINOIDS[payload.thcTolerance] || TOLERANCE_CANNABINOIDS.new;
  vec[0] = cann.thc;
  vec[1] = cann.cbd;
  vec[2] = 0.05; // cbg — baseline
  vec[3] = 0.05; // cbn — baseline

  // ── Stage 1: Clinical indications → positive terpenes + kill-switches ─────
  for (const ind of payload.indications || []) {
    const map = CLINICAL_MAP[ind];
    if (!map) continue;
    for (const terp of map.positive_terpenes) {
      if (TERP_IDX[terp] !== undefined) vec[TERP_IDX[terp]] += 1.5;
    }
    for (const ks of map.kill_switch) {
      killSwitches[ks] = (killSwitches[ks] || 0) + 1.0;
    }
  }

  // ── Stage 1: Risk flags → hard kill-switches ──────────────────────────────
  if (payload.panicHistory) {
    killSwitches.terpinolene = (killSwitches.terpinolene || 0) + 1.0;
    killSwitches.pinene      = (killSwitches.pinene      || 0) + 0.7;
    // suppress these dims in the target vector too
    vec[TERP_IDX.terpinolene] = Math.max(0, vec[TERP_IDX.terpinolene] - 1.0);
    vec[TERP_IDX.pinene]      = Math.max(0, vec[TERP_IDX.pinene]      - 0.5);
  }
  if (payload.anxietyThreshold === "high") {
    killSwitches.terpinolene = (killSwitches.terpinolene || 0) + 0.6;
  }
  if (payload.bloodThinners) {
    // Blood thinners flag — not a terpene kill-switch but stored in metadata
    // Stored in onboarding_metadata for physician reference
  }

  // ── Stage 2: Sensory selections → terpene weights ─────────────────────────
  for (const [flavorId, intensity] of Object.entries(payload.scentSelections || {})) {
    const mult = intensity === "loved" ? 1.6 : intensity === "liked" ? 1.0 : -0.6;
    const terps = FLAVOR_TERP_MAP[flavorId] || {};
    for (const [terp, base] of Object.entries(terps)) {
      if (TERP_IDX[terp] !== undefined) vec[TERP_IDX[terp]] += base * mult;
    }
  }

  // ── Stage 3: Circadian context ────────────────────────────────────────────
  const timing    = payload.usageTiming || [];
  const isDaytime  = timing.includes("daytime");
  const isNight   = timing.includes("nighttime");

  if (isDaytime && !isNight) {
    vec[TERP_IDX.pinene]    += 0.8;
    vec[TERP_IDX.limonene]  += 0.6;
    vec[1] = Math.max(vec[1], 0.30); // prefer lower-THC during day
  } else if (isNight && !isDaytime) {
    vec[TERP_IDX.myrcene]   += 1.0;
    vec[TERP_IDX.linalool]  += 0.8;
    vec[0] = Math.min(vec[0] + 0.05, 1.0); // slightly higher THC for sedation OK
  }

  // Primary goal boosts
  const goalTerps = GOAL_BOOSTS[payload.primaryGoal] || {};
  for (const [terp, w] of Object.entries(goalTerps)) {
    if (TERP_IDX[terp] !== undefined) vec[TERP_IDX[terp]] += w;
  }

  // Delivery method: oil users → boost sustained-effect terpenes
  if ((payload.deliveryMethods || []).includes("oil")) {
    vec[TERP_IDX.myrcene]   += 0.3;
    vec[TERP_IDX.linalool]  += 0.3;
  }

  // ── Stage 4: Legacy genetics ──────────────────────────────────────────────
  for (const strainId of payload.lovedStrains || []) {
    const terps = LEGACY_GENETICS[strainId] || {};
    for (const [terp, w] of Object.entries(terps)) {
      if (TERP_IDX[terp] !== undefined) vec[TERP_IDX[terp]] += w * 1.3;
    }
  }
  for (const strainId of payload.hatedStrains || []) {
    const terps = LEGACY_GENETICS[strainId] || {};
    for (const [terp, w] of Object.entries(terps)) {
      if (TERP_IDX[terp] !== undefined) vec[TERP_IDX[terp]] -= w * 0.9;
      if (killSwitches[terp] !== undefined) killSwitches[terp] += 0.4;
    }
  }

  // ── Normalize terpene dimensions (4–11) to [0, 1] ────────────────────────
  const terpSlice = vec.slice(4);
  const maxTerp   = Math.max(...terpSlice, 0.01);
  for (let i = 4; i < 12; i++) {
    vec[i] = Math.max(0, vec[i] / maxTerp);
  }

  // Clamp cannabinoid dims
  for (let i = 0; i < 4; i++) {
    vec[i] = Math.max(0, Math.min(1, vec[i]));
  }

  return { targetVector: vec, killSwitches };
}

/**
 * buildInitialDNA — assembles the complete DNA profile for DB storage
 */
export function buildInitialDNA(payload) {
  const { targetVector, killSwitches } = buildOnboardingVector(payload);

  // Aggregate positive terpenes for target_terpenes map
  const targetTerpenes = {};
  for (const ind of payload.indications || []) {
    const map = CLINICAL_MAP[ind];
    if (!map) continue;
    for (const terp of map.positive_terpenes) {
      targetTerpenes[terp] = (targetTerpenes[terp] || 0) + 1.0;
    }
  }
  for (const [flavorId, intensity] of Object.entries(payload.scentSelections || {})) {
    if (intensity === "disliked") continue;
    const mult = intensity === "loved" ? 1.0 : 0.6;
    for (const terp of Object.keys(FLAVOR_TERP_MAP[flavorId] || {})) {
      targetTerpenes[terp] = (targetTerpenes[terp] || 0) + mult;
    }
  }

  // Target genetics from loved legacy strains
  const targetGenetics = {};
  for (const strainId of payload.lovedStrains || []) {
    targetGenetics[strainId] = (targetGenetics[strainId] || 0) + 1.5;
  }

  // Kill-switch filter: only keep terpenes with weight >= 0.6
  const triggerTerpenes = {};
  for (const [terp, weight] of Object.entries(killSwitches)) {
    if (weight >= 0.6) triggerTerpenes[terp] = Math.min(weight, 1.0);
  }

  return {
    indications:      payload.indications || [],
    target_genetics:  targetGenetics,
    target_terpenes:  targetTerpenes,
    trigger_terpenes: triggerTerpenes,
    target_vector:    targetVector,
    report_count:     0,
    onboarding_completed: true,
    onboarding_metadata: {
      thc_tolerance:    payload.thcTolerance,
      panic_history:    payload.panicHistory,
      blood_thinners:   payload.bloodThinners,
      anxiety_threshold: payload.anxietyThreshold,
      delivery_methods: payload.deliveryMethods,
      usage_timing:     payload.usageTiming,
      primary_goal:     payload.primaryGoal,
      completed_at:     new Date().toISOString(),
    },
  };
}

export { buildOnboardingVector, TERP_IDX };
