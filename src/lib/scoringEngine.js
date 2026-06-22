// ─────────────────────────────────────────────────────────────
//  CannaMatch — Unified Scoring Engine
//  Pure ESM, zero side-effects. No DOM, no Node APIs.
//  Works in browser (Vite) and Node (api/server.js) identically.
//
//  Data contract (terp-dict format):
//    strain.terps  = { myrcene: 0.8, linalool: 0.6, ... }   (0–1 scale)
//    strain.effects = ["sleep","pain",...]
//    strain.cat    = "T22/C4"
//    strain.id     = string
//
//  Config object shape:
//    { strains: Strain[], terpenes: TerpMeta, reasons: Reason[] }
// ─────────────────────────────────────────────────────────────

/**
 * buildProfile — derive a terpene-weight map from the user's answers + ratings.
 *
 * @param {object} ans      - onboarding answers {reasons, flavors, helped, notHelped, cats, ...}
 * @param {object} ratings  - {[strainId]: number 1-10}
 * @param {object} cfg      - { strains, terpenes, reasons }
 * @returns {{ [terpene]: number }}
 */
export function buildProfile(ans, ratings, { strains, terpenes, reasons }) {
  const w = {};
  const add = (t, v) => { if (t && terpenes[t]) w[t] = (w[t] || 0) + v; };
  if (!ans) return w;

  (ans.flavors || []).forEach((t) => add(t, 1.0));

  (ans.reasons || []).forEach((rid) => {
    const r = reasons.find((x) => x.id === rid);
    r?.terps.forEach((t, i) => add(t, i === 0 ? 1.2 : 0.8));
  });

  (ans.helped || []).forEach((sid) => {
    const s = strains.find((x) => x.id === sid);
    s && Object.entries(s.terps).forEach(([t, v]) => add(t, v * 1.5));
  });

  (ans.notHelped || []).forEach((sid) => {
    const s = strains.find((x) => x.id === sid);
    s && Object.entries(s.terps).forEach(([t, v]) => add(t, -v * 1.5));
  });

  Object.entries(ratings || {}).forEach(([sid, r]) => {
    const s = strains.find((x) => x.id === sid);
    const f = ((r - 5.5) / 4.5) * 2.0;
    s && Object.entries(s.terps).forEach(([t, v]) => add(t, v * f));
  });

  // Pre-computed terpene weights from conditions / oilEffects / timing / primaryGoals
  // — set by the onboarding wizard's computeLiveVector and passed through localAns
  Object.entries(ans.terpWeights || {}).forEach(([t, v]) => add(t, v));

  return w;
}

/**
 * rawScore — unnormalized match score for a single strain against a profile.
 * Higher = better fit. Not bounded.
 *
 * @param {object} strain
 * @param {{ [terpene]: number }} profile - output of buildProfile
 * @param {object} ans
 * @returns {number}
 */
export function rawScore(strain, profile, ans) {
  let s = 0;
  Object.entries(strain.terps).forEach(([t, v]) => { s += v * (profile[t] || 0); });
  const hits = strain.effects.filter((e) => (ans.reasons || []).includes(e)).length;
  s += hits * 1.4;
  if ((ans.notHelped || []).includes(strain.id) && !(ans.helped || []).includes(strain.id)) s -= 5;
  return s;
}

/**
 * scoreAll — rank the full strain catalog against the user's current state.
 * Returns array sorted best-first, each strain augmented with { match: 40-98, _raw }.
 *
 * @param {object} ans
 * @param {object} ratings
 * @param {object} cfg        - { strains, terpenes, reasons }
 * @param {string[]} indFilter - indication ids to narrow results (empty = show all)
 * @param {string}  typeFilter - "all" | "flower" | "oil"
 * @returns {Strain[]}
 */
export function scoreAll(ans, ratings, { strains, terpenes, reasons }, indFilter = [], typeFilter = "all") {
  const profile = buildProfile(ans, ratings, { strains, terpenes, reasons });

  let eligible = strains.filter((s) => (ans.cats || []).includes(s.cat));

  if (typeFilter !== "all") {
    eligible = eligible.filter((s) => (s.type || "flower") === typeFilter);
  }

  if (indFilter.length > 0) {
    eligible = eligible.filter((s) => s.effects.some((e) => indFilter.includes(e)));
  }

  const raws = eligible.map((s) => ({ s, r: rawScore(s, profile, ans) }));
  const max = Math.max(...raws.map((x) => x.r), 3);

  return raws
    .map(({ s, r }) => {
      const rel = Math.max(0, r) / (max || 1);
      const match = Math.round(40 + rel * 58); // 40–98 range; low fit stays visible but clearly ranked lower
      return { ...s, match, _raw: r };
    })
    .sort((a, b) => b.match - a.match);
}

/**
 * matchTier — map a 0-100 score to a display tier.
 * Threshold: 85% = excellent, 72% = good, 60% = partial.
 */
export function matchTier(pct) {
  if (pct >= 85) return { label: "התאמה מצוינת", color: "#2E6B53", bg: "#E7F0E9", show: true,  icon: "🎯" };
  if (pct >= 72) return { label: "התאמה טובה",   color: "#5E7C4F", bg: "#EFF5EF", show: true,  icon: "✓"  };
  if (pct >= 60) return { label: "התאמה חלקית",  color: "#9C6F12", bg: "#FBF3E3", show: false, icon: "~"  };
  return              { label: "התאמה נמוכה",   color: "#9AA79C", bg: "#F0F0EE", show: false, icon: "·"  };
}

/**
 * createEngine — convenience factory that binds cfg once.
 * Usage:
 *   import { createEngine } from './lib/scoringEngine.js';
 *   import { STRAINS, TERPENES, REASONS } from './data/strainsConfig.js';
 *   const engine = createEngine({ strains: STRAINS, terpenes: TERPENES, reasons: REASONS });
 *   const scored = engine.scoreAll(ans, ratings);
 */
export function createEngine({ strains, terpenes, reasons }) {
  const cfg = { strains, terpenes, reasons };
  return {
    buildProfile: (ans, ratings) => buildProfile(ans, ratings, cfg),
    rawScore:     (strain, profile, ans) => rawScore(strain, profile, ans),
    scoreAll:     (ans, ratings, indFilter, typeFilter) =>
                    scoreAll(ans, ratings, cfg, indFilter, typeFilter),
  };
}
