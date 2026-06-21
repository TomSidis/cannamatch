import { useState, useCallback, useMemo } from "react";
import { FLAVOR_TERP_MAP, LEGACY_GENETICS } from "../lib/onboardingConstants.js";

// Stage indices — 7 stages total
export const STAGE_NAMES = ["license", "form", "goals", "sensory", "circadian", "products", "preview"];

export const INITIAL_PAYLOAD = {
  // Stage 0 — License (optional)
  licenseVerified:   false,
  licenseExpiry:     null,
  licenseCategories: [],

  // Stage 1 — Consumption form (single choice, required)
  consumptionForm:   null,   // "flower" | "oil" | "vape" | "mixed"

  // Stage 2 — Cannabis Goals
  effectGoals:       [],
  thcTolerance:      "new",

  // Stage 3 — Sensory (flower/vape) or Oil Effects (oil users)
  scentSelections:   {},
  oilEffects:        [],

  // Stage 4 — Circadian
  usageTiming:       [],     // multi-select: "morning","noon","afternoon","evening","night"
  primaryGoal:       null,
  deliveryMethods:   [],     // auto-derived from consumptionForm in handleComplete

  // Stage 5 — Products (replaced lineage names with real market names)
  lovedStrains:      [],
  hatedStrains:      [],
};

function validateStage(stageIdx, payload) {
  const errs = {};
  switch (stageIdx) {
    case 0:
      // License is optional — always passes
      break;
    case 1:
      if (!payload.consumptionForm) errs.form = "אנא בחר/י דרך צריכה כדי שנוכל להתאים לך את המוצרים הנכונים";
      break;
    case 2:
      if (payload.effectGoals.length === 0) errs.effectGoals = "בחר/י לפחות מטרה אחת";
      if (!payload.thcTolerance)            errs.thcTolerance = "שדה חובה";
      break;
    case 3:
      // Sensory / oil-effects — optional
      break;
    case 4:
      if (payload.usageTiming.length === 0) errs.timing = "בחר/י זמן שימוש אחד לפחות";
      if (!payload.primaryGoal)             errs.goal   = "בחר/י מטרה ראשית";
      break;
    default:
      break;
  }
  return errs;
}

// Cannabis-goal → terpene contribution map
const GOAL_TERP_MAP = {
  sleep:     { myrcene: 1.4, linalool: 1.1, caryophyllene: 0.6 },
  pain:      { caryophyllene: 1.5, myrcene: 1.0, humulene: 0.8 },
  focus:     { pinene: 1.4, limonene: 1.0, terpinolene: 0.6 },
  relax:     { linalool: 1.3, myrcene: 0.9, limonene: 0.6 },
  mood:      { limonene: 1.5, linalool: 0.9, caryophyllene: 0.5 },
  energy:    { terpinolene: 1.3, limonene: 1.1, pinene: 0.8 },
  appetite:  { myrcene: 1.2, limonene: 0.7, ocimene: 0.5 },
  creative:  { terpinolene: 1.1, limonene: 1.0, pinene: 0.6 },
};

// Oil-effects → terpene map (shown instead of flavor for oil users)
const OIL_EFFECT_TERP_MAP = {
  calm_body:    { myrcene: 1.4, linalool: 0.8, humulene: 0.5 },
  clear_head:   { pinene: 1.4, limonene: 1.0, terpinolene: 0.6 },
  deep_sleep:   { myrcene: 1.6, linalool: 1.2, caryophyllene: 0.4 },
  pain_relief:  { caryophyllene: 1.5, myrcene: 0.9, humulene: 0.7 },
  appetite:     { myrcene: 1.2, humulene: 0.8, limonene: 0.5 },
  anxiety_calm: { linalool: 1.3, limonene: 1.0, caryophyllene: 0.4 },
};

// Timing → terpene lean (granular 5-part day)
const TIMING_TERP_LEAN = {
  morning:   { pinene: 0.7, limonene: 0.5 },
  noon:      { pinene: 0.5, terpinolene: 0.5 },
  afternoon: { limonene: 0.4, terpinolene: 0.3 },
  evening:   { linalool: 0.6, myrcene: 0.5 },
  night:     { myrcene: 1.0, linalool: 0.8 },
};

function computeLiveVector(payload) {
  const acc = {};
  const add = (t, v) => { acc[t] = (acc[t] || 0) + v; };

  // From effect goals
  for (const goal of (payload.effectGoals || [])) {
    const map = GOAL_TERP_MAP[goal];
    if (!map) continue;
    for (const [terp, weight] of Object.entries(map)) add(terp, weight);
  }

  // From scent selections (flower/vape users)
  for (const [flavorId, intensity] of Object.entries(payload.scentSelections || {})) {
    const mult = intensity === "loved" ? 1.6 : intensity === "liked" ? 1.0 : -0.6;
    for (const [terp, base] of Object.entries(FLAVOR_TERP_MAP[flavorId] || {})) {
      add(terp, base * mult);
    }
  }

  // From oil effects (oil users)
  for (const effect of (payload.oilEffects || [])) {
    const map = OIL_EFFECT_TERP_MAP[effect];
    if (!map) continue;
    for (const [terp, weight] of Object.entries(map)) add(terp, weight);
  }

  // From 5-part timing
  for (const slot of (payload.usageTiming || [])) {
    const lean = TIMING_TERP_LEAN[slot];
    if (!lean) continue;
    for (const [terp, weight] of Object.entries(lean)) add(terp, weight);
  }

  const goalBoost = {
    focus:      { pinene: 0.9, limonene: 0.7 },
    relax:      { linalool: 0.9, myrcene: 0.7 },
    sleep:      { myrcene: 1.1, linalool: 0.9 },
    pain_relief:{ caryophyllene: 1.1, myrcene: 0.8 },
    mood:       { limonene: 1.1, linalool: 0.6 },
  }[payload.primaryGoal] || {};
  for (const [t, w] of Object.entries(goalBoost)) add(t, w);

  // From products (real market names mapped through LEGACY_GENETICS for backward compat)
  for (const sid of (payload.lovedStrains || [])) {
    for (const [t, w] of Object.entries(LEGACY_GENETICS[sid] || {})) add(t, w * 1.3);
  }
  for (const sid of (payload.hatedStrains || [])) {
    for (const [t, w] of Object.entries(LEGACY_GENETICS[sid] || {})) add(t, -w * 0.9);
  }

  // Normalize to [0, 1]
  const vals   = Object.values(acc);
  const maxVal = Math.max(...vals.filter((v) => v > 0), 0.01);
  const result = {};
  for (const [t, v] of Object.entries(acc)) {
    result[t] = Math.max(-1, Math.min(1, v / maxVal));
  }
  return result;
}

function computeKillSwitches(_payload) {
  return {};
}

export function useOnboardingStore() {
  const [stage, setStage]     = useState(0);
  const [payload, setPayload] = useState(INITIAL_PAYLOAD);
  const [errors, setErrors]   = useState({});

  const updatePayload = useCallback((updates) => {
    setPayload((p) => ({ ...p, ...updates }));
    setErrors({});
  }, []);

  const goNext = useCallback(() => {
    const errs = validateStage(stage, payload);
    if (Object.keys(errs).length > 0) { setErrors(errs); return false; }
    setErrors({});
    setStage((s) => Math.min(STAGE_NAMES.length - 1, s + 1));
    return true;
  }, [stage, payload]);

  const skipStage = useCallback(() => {
    setErrors({});
    setStage((s) => Math.min(STAGE_NAMES.length - 1, s + 1));
  }, []);

  const goPrev = useCallback(() => {
    setErrors({});
    setStage((s) => Math.max(0, s - 1));
  }, []);

  const liveVector   = useMemo(() => computeLiveVector(payload), [payload]);
  const killSwitches = useMemo(() => computeKillSwitches(payload), [payload]);

  return {
    stage,
    stageName:   STAGE_NAMES[stage],
    totalStages: STAGE_NAMES.length,
    payload,
    errors,
    liveVector,
    killSwitches,
    updatePayload,
    goNext,
    skipStage,
    goPrev,
  };
}
