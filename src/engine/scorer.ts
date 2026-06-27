import type { Batch, UserNeed, ScoredProduct, ReportAggregate, BatchReportMap, Terpene, Provenance, EffectAxis } from './types.ts';
import { EFFECT_AXIS_KEYS } from './types.ts';
import { cosine, buildPriorVector, buildProductVector, chemotypeFromBatch } from './vectorMath.ts';
import { TERPENE_EFFECTS, CHEMOTYPE_MARKERS, CLUSTERS, CLUSTER_EFFECT_FLAG } from '../data/terpeneScience.ts';
import { getKillSwitchThreshold } from '../data/killSwitchConfig.ts';

// ── §4.2 Constants ────────────────────────────────────────────────────────────
const K = 8; // prior-strength for Bayesian shrinkage: w(n,K) = n/(n+K)

function w(n: number): number { return n / (n + K); }
function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }

// ── Evidence factor ───────────────────────────────────────────────────────────
// Maps literature strength to a confidence multiplier ∈ [0.5, 1.0].
// Applied only to prior+measured confidence components; community stays untouched.
const EVIDENCE_WEIGHTS = { human: 1.0, mixed: 0.75, preclinical: 0.5 } as const;

function computeEvidenceFactor(batch: Batch): number {
  if (batch.terpenes.length > 0) {
    // Measured: weight each terpene's evidence by its pct fraction.
    const total = batch.terpenes.reduce((s, r) => s + r.pct, 0) || 1;
    let wSum = 0;
    for (const { terpene, pct } of batch.terpenes) {
      const def = TERPENE_EFFECTS.find(e => e.terpene === terpene);
      wSum += (def ? EVIDENCE_WEIGHTS[def.evidence] : EVIDENCE_WEIGHTS.preclinical) * pct;
    }
    return clamp(wSum / total, 0.5, 1.0);
  }
  // Prior-only: average over chemotype marker terpenes.
  const markers = CHEMOTYPE_MARKERS[chemotypeFromBatch(batch)] ?? [];
  if (markers.length === 0) return 0.5;
  const sum = markers.reduce<number>((acc, t) => {
    const def = TERPENE_EFFECTS.find(e => e.terpene === t);
    return acc + (def ? EVIDENCE_WEIGHTS[def.evidence] : EVIDENCE_WEIGHTS.preclinical);
  }, 0);
  return clamp(sum / markers.length, 0.5, 1.0);
}

// ── Q6: Cluster effect hook (DEFERRED to Layer 2) ────────────────────────────
// Returns a nudge ∈ [0, 0.15] to add to the measured cosine score when the
// batch's dominant terpenes match a known synergistic cluster.
//
// Currently returns 0 — CLUSTER_EFFECT_FLAG is false.
// Implementation note for Layer 2: weight the cluster lean against need.effect
// (cosine similarity), scale by cluster evidence quality, and cap at 0.15 so
// it never dominates the raw signal. Do NOT use this on inferred batches.
function computeClusterBonus(batch: Batch, need: UserNeed): number {
  if (!CLUSTER_EFFECT_FLAG) return 0; // ← flip this flag in terpeneScience.ts to enable
  if (batch.terpenes.length < 2) return 0;

  const batchTerps = new Set(batch.terpenes.map(r => r.terpene));
  let best = 0;
  for (const cluster of CLUSTERS) {
    const hits = cluster.members.filter(m => batchTerps.has(m)).length;
    if (hits < 2) continue;
    // DEFERRED: replace stub (0) with cosine(need.effect, cluster.lean) × weight
    // Placeholder: 0 — not wired until Layer 2 measured data is available.
    void cluster; void need;
    best = Math.max(best, 0);
  }
  return best;
}

// ── §4.2 Three-layer blend ────────────────────────────────────────────────────
export function scoreSingle(
  need: UserNeed,
  batch: Batch,
  reports: ReportAggregate = { n: 0, mean: 0 },
): ScoredProduct {
  // Eligibility gate (§4.4): legal license categories checked FIRST — spec P5 order.
  // A batch outside the user's licensed categories is dropped here, before any cosine math.
  if (need.licenseCategories.length > 0 && !need.licenseCategories.includes(batch.category)) {
    return licenseDeniedResult(batch);
  }

  // Kill-switch: personal terpene trigger — checked after eligibility, before cosine.
  if (isKillSwitchViolated(need.killSwitches, batch)) {
    return killSwitchResult(batch);
  }

  // Layer 1 — prior: always use genetics/chemotype prior, ignoring batch terpenes
  const priorVec  = buildPriorVector(batch);
  const prior     = cosine(need.effect, priorVec);

  // Layer 2 — measured: use actual batch terpenes when available.
  // Q2: declared terpene data is 85% trustworthy vs COA-measured (15% provenance discount).
  // The discount reduces the cosine score, NOT wMeasured, so topLayer stays 'measured' for
  // declared batches (required by scorer.test.ts:108 and the UX spec).
  const hasTerpenes  = batch.terpenes.length > 0;
  const provDiscount = hasTerpenes && batch.provenance !== 'measured' ? 0.85 : 1.0;
  const measuredVec  = hasTerpenes ? buildProductVector(batch).vec : priorVec;
  const measuredBase = hasTerpenes ? cosine(need.effect, measuredVec) * provDiscount : prior;
  // Q6 hook: cluster bonus is 0 until CLUSTER_EFFECT_FLAG=true (Layer 2).
  const measured     = clamp(measuredBase + computeClusterBonus(batch, need), 0, 1);

  // Layer 3 — community
  const wCommunity  = w(reports.n);
  const community   = clamp(reports.mean, 0, 1);

  // Weights (unchanged — provenance handled via discount on measured cosine score above)
  const wMeasured = hasTerpenes ? 1 : 0;
  const wPrior    = Math.max(0, 1 - Math.max(wMeasured * 0.6, wCommunity));

  const numerator   = wPrior * prior + wMeasured * 0.6 * measured + wCommunity * community;
  const denominator = wPrior + wMeasured * 0.6 + wCommunity;

  const finalScore = denominator > 0 ? numerator / denominator : prior;
  const matchPct   = Math.round(clamp(finalScore * 100, 0, 100));

  // §4.3 Confidence — prior+measured components modulated by literature evidence quality.
  // Community component is intentionally NOT modulated: real reports override evidence level.
  //
  // Q2: declared data gets a 0.85× provenance factor (vs 1.0 for measured).
  // Cultivation inheritance (inferred tier) gets a further 0.85× for batches that
  // inherited their cultivation method from a sibling — those have extra uncertainty.
  const hasMeasuredI     = hasTerpenes ? 1 : 0;
  const evidenceFactor   = computeEvidenceFactor(batch);
  const priorBase        = batch.geneticsPrior?.conf ?? 0.35;
  const provFactor       = hasTerpenes && batch.provenance !== 'measured' ? 0.85 : 1.0;
  const inheritFactor    = batch.inheritedCultivation ? 0.85 : 1.0;
  const confidence       = clamp(
    (priorBase + 0.30 * hasMeasuredI) * evidenceFactor * provFactor * inheritFactor
    + 0.35 * w(reports.n),
    0, 1,
  );

  // Dominant layer for UI messaging (wMeasured unchanged → topLayer unaffected by provDiscount)
  const wMeas60 = wMeasured * 0.6;
  const topLayer: ScoredProduct['topLayer'] =
    wCommunity > wMeas60 && wCommunity > wPrior ? 'community' :
    wMeas60 > wPrior ? 'measured' : 'prior';

  // Human reason string — no chemistry, never shows terpene names
  const reasonHuman = buildReasonHuman(need, batch, topLayer, confidence);

  return { productId: batch.productId, batchId: batch.id, matchPct, confidence, reasonHuman, topLayer };
}

// ── Kill-switch check ─────────────────────────────────────────────────────────
// Measures terpene DOMINANCE (pct / total_terpene_pct), NOT THC percentage.
// Per-terpene thresholds from killSwitchConfig.ts.
// Q7: declared data uses a tighter threshold (×0.75) — producer-stated values may
// understate dominant terpenes, so we fire earlier to compensate.
function killSwitchThreshold(terpene: Terpene, provenance: Provenance): number {
  const base = getKillSwitchThreshold(terpene);
  return provenance === 'measured' ? base : base * 0.75;
}

function isKillSwitchViolated(killSwitches: Terpene[], batch: Batch): boolean {
  if (killSwitches.length === 0 || batch.terpenes.length === 0) return false;
  const total = batch.terpenes.reduce((s, r) => s + r.pct, 0);
  if (total <= 0) return false;
  return killSwitches.some(ks =>
    batch.terpenes.some(r => {
      if (r.terpene !== ks) return false;
      return r.pct / total >= killSwitchThreshold(ks, batch.provenance);
    })
  );
}

function killSwitchResult(batch: Batch): ScoredProduct {
  return {
    productId:   batch.productId,
    batchId:     batch.id,
    matchPct:    0,
    confidence:  0,
    reasonHuman: 'הוסר — טריגר בפרופיל שלך',
    topLayer:    'prior',
  };
}

function licenseDeniedResult(batch: Batch): ScoredProduct {
  return {
    productId:   batch.productId,
    batchId:     batch.id,
    matchPct:    0,
    confidence:  0,
    reasonHuman: 'לא בקטגוריות הרישיון שלך',
    topLayer:    'prior',
  };
}

// ── Human reason string (§1 rule 5: no chemistry) ────────────────────────────
function buildReasonHuman(
  need: UserNeed,
  batch: Batch,
  topLayer: ScoredProduct['topLayer'],
  confidence: number,
): string {
  if (confidence < 0.4) return 'עדיין מעט דיווחים — תנסה ותדווח 🌱';

  if (topLayer === 'community') return 'מטופלים עם פרופיל דומה לך דיווחו על עזרה';

  // Match the user's top condition to a feeling
  const cond = need.conditions[0];
  const condLabels: Record<string, string> = {
    sleep:    'מסייע לשינה 🌙',
    anxiety:  'מרגיע חרדה 🧘',
    pain:     'מקל על כאב 💊',
    focus:    'מחדד ריכוז ⚡',
    appetite: 'מגרה תיאבון 🍽️',
    gi:       'עוזר למערכת העיכול',
    ptsd:     'עוזר לפוסט-טראומה 🛡️',
    mood:     'מרומם מצב רוח 🌞',
    diabetes: 'מקל על כאב עצבי',
    epilepsy: 'פרופיל מאוזן',
  };
  if (cond && condLabels[cond]) return condLabels[cond];

  // Fallback: describe the dominant effect axis
  const topAxis = dominantAxis(need.effect);
  const axisLabels: Record<EffectAxis, string> = {
    bodyCalm:   'מרגיע את הגוף',
    clearHead:  'ראש צלול',
    sleep:      'מסייע לשינה',
    antiPain:   'מקל על כאב',
    mood:       'מרומם מצב רוח',
    antiAnxiety:'מרגיע חרדה',
    appetite:   'מגרה תיאבון',
  };
  return axisLabels[topAxis] ?? 'פרופיל מתאים לך';
}

function dominantAxis(vec: Record<EffectAxis, number>): EffectAxis {
  return (EFFECT_AXIS_KEYS as EffectAxis[]).reduce(
    (best, k) => (vec[k] ?? 0) > (vec[best] ?? 0) ? k : best,
    EFFECT_AXIS_KEYS[0] as EffectAxis,
  );
}

// ── scoreAll convenience (used by basketPlanner tests) ───────────────────────
export function scoreAll(
  need: UserNeed,
  batches: { batch: Batch; reports: ReportAggregate }[],
): ScoredProduct[] {
  return batches
    .map(({ batch, reports }) => scoreSingle(need, batch, reports))
    .sort((a, b) => b.matchPct - a.matchPct || b.confidence - a.confidence);
}

// ── scoreAllWithMap — Phase 4.2: reports keyed by grow_batch_id ──────────────
// Reports are batch-level (not strain-level). A batch with no entry gets n=0.
// This is the entry point for the API layer to call after querying grow_batch + reports.
export function scoreAllWithMap(
  need: UserNeed,
  batches: Batch[],
  reportMap: BatchReportMap,
): ScoredProduct[] {
  return batches
    .map(batch => {
      const reports = reportMap[batch.id] ?? { n: 0, mean: 0 };
      return scoreSingle(need, batch, reports);
    })
    .sort((a, b) => b.matchPct - a.matchPct || b.confidence - a.confidence);
}
