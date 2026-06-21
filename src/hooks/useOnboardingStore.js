import { useState, useCallback, useMemo } from "react";
import { FLAVOR_TERP_MAP, LEGACY_GENETICS } from "../lib/onboardingConstants.js";

// Stage indices
export const STAGE_NAMES = ["goals", "sensory", "circadian", "genetics", "preview"];

export const INITIAL_PAYLOAD = {
  // Stage 1 — Cannabis Goals (no medical history collected)
  effectGoals:       [],   // ["sleep","pain","focus","relax","mood","energy","appetite","creative"]
  thcTolerance:      "new",
  // Stage 2 — Sensory: { flavorId: 'liked' | 'loved' | 'disliked' }
  scentSelections:   {},
  // Stage 3 — Circadian
  usageTiming:       [],
  primaryGoal:       null,
  deliveryMethods:   [],
  // Stage 4 — Genetics
  lovedStrains:      [],
  hatedStrains:      [],
};

function validateStage(stageIdx, payload) {
  const errs = {};
  switch (stageIdx) {
    case 0:
      if (payload.effectGoals.length === 0)  errs.effectGoals = "בחר/י לפחות מטרה אחת";
      if (!payload.thcTolerance)             errs.thcTolerance = "שדה חובה";
      break;
    case 1:
      // Flavor is optional — user can skip without selecting any scent
      break;
    case 2:
      if (payload.usageTiming.length === 0)  errs.timing   = "בחר זמן שימוש אחד לפחות";
      if (!payload.primaryGoal)              errs.goal     = "בחר מטרה ראשית";
      if (payload.deliveryMethods.length === 0) errs.delivery = "בחר דרך מתן אחת לפחות";
      break;
    default:
      break;
  }
  return errs;
}

// Cannabis-goal → terpene contribution map (pure preference-based, no medical history)
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

/**
 * Compute a live terpene weight preview from the accumulated payload.
 * Returns { terpene: weight } sorted by descending weight.
 */
function computeLiveVector(payload) {
  const acc = {};
  const add = (t, v) => { acc[t] = (acc[t] || 0) + v; };

  // From effect goals — implicitly derives terpene profile without asking medical questions
  for (const goal of (payload.effectGoals || [])) {
    const map = GOAL_TERP_MAP[goal];
    if (!map) continue;
    for (const [terp, weight] of Object.entries(map)) add(terp, weight);
  }

  // From scent selections
  for (const [flavorId, intensity] of Object.entries(payload.scentSelections)) {
    const mult = intensity === "loved" ? 1.6 : intensity === "liked" ? 1.0 : -0.6;
    for (const [terp, base] of Object.entries(FLAVOR_TERP_MAP[flavorId] || {})) {
      add(terp, base * mult);
    }
  }

  // From circadian
  if (payload.usageTiming.includes("daytime") && !payload.usageTiming.includes("nighttime")) {
    add("pinene", 0.8); add("limonene", 0.6);
  }
  if (payload.usageTiming.includes("nighttime") && !payload.usageTiming.includes("daytime")) {
    add("myrcene", 1.0); add("linalool", 0.8);
  }
  const goalBoost = {
    focus: { pinene: 0.9, limonene: 0.7 },
    relax: { linalool: 0.9, myrcene: 0.7 },
    sleep: { myrcene: 1.1, linalool: 0.9 },
    pain_relief: { caryophyllene: 1.1, myrcene: 0.8 },
    mood: { limonene: 1.1, linalool: 0.6 },
  }[payload.primaryGoal] || {};
  for (const [t, w] of Object.entries(goalBoost)) add(t, w);

  // From legacy genetics
  for (const sid of payload.lovedStrains) {
    for (const [t, w] of Object.entries(LEGACY_GENETICS[sid] || {})) add(t, w * 1.3);
  }
  for (const sid of payload.hatedStrains) {
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
  // Kill switches are now derived entirely by the backend scoring engine
  // from the user's explicit DNA vector — not from self-reported medical history.
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

  const liveVector    = useMemo(() => computeLiveVector(payload), [payload]);
  const killSwitches  = useMemo(() => computeKillSwitches(payload), [payload]);

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
