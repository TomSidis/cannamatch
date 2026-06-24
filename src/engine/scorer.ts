import type { Batch, UserNeed, ScoredProduct, ReportAggregate, Terpene, EffectAxis } from './types';
import { EFFECT_AXIS_KEYS } from './types';
import { cosine, buildPriorVector, buildProductVector, chemotypeFromBatch } from './vectorMath';
import { TERPENE_EFFECTS, CHEMOTYPE_MARKERS } from '../data/terpeneScience';

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

// ── §4.2 Three-layer blend ────────────────────────────────────────────────────
export function scoreSingle(
  need: UserNeed,
  batch: Batch,
  reports: ReportAggregate = { n: 0, mean: 0 },
): ScoredProduct {
  // Kill-switch: if any kill terpene is dominant in the batch → hard exclude (score → 0)
  if (isKillSwitchViolated(need.killSwitches, batch)) {
    return killSwitchResult(batch);
  }

  // License gate: category must be in user's allowed list (§4.4)
  if (need.licenseCategories.length > 0 && !need.licenseCategories.includes(batch.category)) {
    return licenseDeniedResult(batch);
  }

  // Layer 1 — prior: always use genetics/chemotype prior, ignoring batch terpenes
  const priorVec  = buildPriorVector(batch);
  const prior     = cosine(need.effect, priorVec);

  // Layer 2 — measured: use actual batch terpenes when available
  const hasMeasured = batch.terpenes.length > 0;
  const measuredVec = hasMeasured ? buildProductVector(batch).vec : priorVec;
  const measured    = hasMeasured ? cosine(need.effect, measuredVec) : prior;

  // Layer 3 — community
  const wCommunity  = w(reports.n);
  const community   = clamp(reports.mean, 0, 1);

  // Weights
  const wMeasured = hasMeasured ? 1 : 0;
  const wPrior    = Math.max(0, 1 - Math.max(wMeasured * 0.6, wCommunity));

  const numerator   = wPrior * prior + wMeasured * 0.6 * measured + wCommunity * community;
  const denominator = wPrior + wMeasured * 0.6 + wCommunity;

  // denominator > 0: wPrior ≥ 0, at least one layer is always > 0 (prior always ≥ 0 and wPrior ≥ 0)
  // In the pathological case where all weights are 0 (impossible by construction), fallback to prior.
  const finalScore = denominator > 0 ? numerator / denominator : prior;
  const matchPct   = Math.round(clamp(finalScore * 100, 0, 100));

  // §4.3 Confidence — prior+measured components modulated by literature evidence quality.
  // Community component is intentionally NOT modulated: real reports override evidence level.
  const hasMeasuredI  = hasMeasured ? 1 : 0;
  const evidenceFactor = computeEvidenceFactor(batch);
  const confidence     = clamp(
    (0.35 + 0.30 * hasMeasuredI) * evidenceFactor + 0.35 * w(reports.n),
    0, 1,
  );

  // Dominant layer for UI messaging
  const wMeas60 = wMeasured * 0.6;
  const topLayer: ScoredProduct['topLayer'] =
    wCommunity > wMeas60 && wCommunity > wPrior ? 'community' :
    wMeas60 > wPrior ? 'measured' : 'prior';

  // Human reason string — no chemistry, never shows terpene names
  const reasonHuman = buildReasonHuman(need, batch, topLayer, confidence);

  return { productId: batch.productId, batchId: batch.id, matchPct, confidence, reasonHuman, topLayer };
}

// ── Kill-switch check ─────────────────────────────────────────────────────────
// A terpene is "dominant" if it contributes ≥20% of the total terpene profile.
function isKillSwitchViolated(killSwitches: Terpene[], batch: Batch): boolean {
  if (killSwitches.length === 0 || batch.terpenes.length === 0) return false;
  const total = batch.terpenes.reduce((s, r) => s + r.pct, 0);
  if (total <= 0) return false;
  return killSwitches.some(ks =>
    batch.terpenes.some(r => r.terpene === ks && r.pct / total >= 0.20)
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

// ── scoreAll convenience (used for §6 wiring) ────────────────────────────────
export function scoreAll(
  need: UserNeed,
  batches: { batch: Batch; reports: ReportAggregate }[],
): ScoredProduct[] {
  return batches
    .map(({ batch, reports }) => scoreSingle(need, batch, reports))
    .sort((a, b) => b.matchPct - a.matchPct || b.confidence - a.confidence);
}
