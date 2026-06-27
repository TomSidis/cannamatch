import type {
  UserNeed, ScoredProduct, BasketPlan, BasketBag,
  EffectAxis, TimeOfDay, Batch,
} from './types.ts';
import { EFFECT_AXIS_KEYS } from './types.ts';
import { cosine, buildPriorVector } from './vectorMath.ts';

const DIVERSITY_THRESHOLD = 0.90; // §5 rule 4
const DEFAULT_GRAMS = 10;

// ── §5 planBasket ─────────────────────────────────────────────────────────────
export function planBasket(
  need: UserNeed,
  scored: ScoredProduct[],
  batches: Batch[],
  opts: { maxBags: number } = { maxBags: 5 },
): BasketPlan {
  const warnings: string[] = [];

  // §5.1 Candidate pool: license-legal, kill-switch-clean, matchPct > 0
  const candidates = scored.filter(s => s.matchPct > 0);
  if (candidates.length === 0) {
    return { bags: [], coverage: { times: [], goals: [] }, warnings: ['אין זנים מתאימים'] };
  }

  // §5.2 Define demands: times × top effect axes
  const topAxes   = topEffectAxes(need, 3);
  const demands   = buildDemands(need.times, topAxes);
  const metDemand = new Set<string>();

  // Batch lookup map for vector diversity check
  const batchMap = new Map(batches.map(b => [b.id, b]));

  // §5.3 Greedy selection by marginal coverage
  const picked: ScoredProduct[] = [];
  const pickedVecs: import('./types.js').EffectVector[] = [];

  const remaining = [...candidates]; // already sorted best-first by scorer
  while (picked.length < opts.maxBags && remaining.length > 0) {
    let bestIdx = -1;
    let bestMarginal = -1;

    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i];
      const b = batchMap.get(cand.batchId);

      // §5.4 Diversity guard: skip near-duplicates unless they cover an unmet demand
      if (b && pickedVecs.length > 0) {
        const cvec = buildPriorVector(b);
        const tooClose = pickedVecs.some(pv => cosine(pv, cvec) > DIVERSITY_THRESHOLD);
        if (tooClose) {
          const marginal = marginalCoverage(cand, need, demands, metDemand);
          if (marginal === 0) continue; // near-duplicate + no new demand → skip
        }
      }

      const m = marginalCoverage(cand, need, demands, metDemand);
      if (m > bestMarginal) { bestMarginal = m; bestIdx = i; }
    }

    if (bestIdx === -1) break;

    const winner = remaining.splice(bestIdx, 1)[0];
    picked.push(winner);

    const bw = batchMap.get(winner.batchId);
    if (bw) pickedVecs.push(buildPriorVector(bw));

    // Mark demands covered by this pick
    for (const d of demands) {
      if (!metDemand.has(d) && pickCoversdemand(winner, need, d)) metDemand.add(d);
    }
  }

  // §5.5 Budget / grams distribution
  const hasGrams = Object.keys(need.gramsByCategory).length > 0;
  if (!hasGrams) warnings.push('כמות גרמים לא ידועה — הערכה בלבד');

  const bags: BasketBag[] = picked.map((s, i) => {
    const b = batchMap.get(s.batchId);
    const cat = b?.category ?? '';
    const budgetForCat = need.gramsByCategory[cat] ?? 0;
    // Distribute proportional to match%; fallback to DEFAULT_GRAMS
    const share = picked.reduce((t, x) => t + x.matchPct, 0) || 1;
    const grams = hasGrams && budgetForCat > 0
      ? Math.round((s.matchPct / share) * budgetForCat)
      : DEFAULT_GRAMS;

    return {
      batchId:  s.batchId,
      role:     bagRole(need, s, i),
      matchPct: s.matchPct,
      grams:    Math.max(1, grams),
      category: cat,
    };
  });

  // Check uncovered demands (§7)
  const uncovered = demands.filter(d => !metDemand.has(d));
  if (uncovered.length > 0) {
    warnings.push(`לא נמצא כיסוי מלא לכל הצרכים: ${uncovered.join(', ')}`);
  }

  const coveredAxes = topAxes.filter(ax =>
    picked.some(s => need.effect[ax] > 0.3 && s.matchPct > 50)
  );

  return {
    bags,
    coverage: {
      times: need.times.filter(t => picked.length > 0), // times covered by any pick
      goals: coveredAxes,
    },
    warnings,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function topEffectAxes(need: UserNeed, n: number): EffectAxis[] {
  return (EFFECT_AXIS_KEYS as EffectAxis[])
    .filter(k => need.effect[k] > 0.2)
    .sort((a, b) => need.effect[b] - need.effect[a])
    .slice(0, n);
}

function buildDemands(times: TimeOfDay[], axes: EffectAxis[]): string[] {
  const d: string[] = [];
  for (const t of times) for (const a of axes) d.push(`${t}:${a}`);
  if (d.length === 0) for (const a of axes) d.push(`any:${a}`);
  return d;
}

function marginalCoverage(
  cand: ScoredProduct,
  need: UserNeed,
  demands: string[],
  met: Set<string>,
): number {
  return demands.filter(d => !met.has(d) && pickCoversdemand(cand, need, d)).length;
}

function pickCoversdemand(s: ScoredProduct, need: UserNeed, demand: string): boolean {
  // A pick "covers" a demand if it has meaningful matchPct and the axis is non-zero in need
  const [_time, axis] = demand.split(':');
  const ax = axis as EffectAxis;
  return s.matchPct >= 50 && need.effect[ax] > 0.2;
}

// §5.6 Human-language bag roles
const TIME_LABELS: Record<TimeOfDay, string> = {
  morning:   'בוקר',
  noon:      'צהריים',
  afternoon: 'אחה"צ',
  evening:   'ערב',
  night:     'לילה',
};

const AXIS_ROLE_LABELS: Record<EffectAxis, string> = {
  bodyCalm:   'רגיעת גוף',
  clearHead:  'ראש צלול',
  sleep:      'שינה',
  antiPain:   'הקלת כאב',
  mood:       'מצב רוח',
  antiAnxiety:'הרגעת חרדה',
  appetite:   'תיאבון',
};

function bagRole(need: UserNeed, s: ScoredProduct, idx: number): string {
  const topAxis = (EFFECT_AXIS_KEYS as EffectAxis[]).reduce(
    (b, k) => need.effect[k] > need.effect[b] ? k : b,
    EFFECT_AXIS_KEYS[0] as EffectAxis,
  );
  const timeLabel = need.times[idx % need.times.length]
    ? TIME_LABELS[need.times[idx % need.times.length]]
    : '';
  const axisLabel = AXIS_ROLE_LABELS[topAxis];
  return timeLabel ? `שקית ${timeLabel} — ${axisLabel}` : axisLabel;
}
