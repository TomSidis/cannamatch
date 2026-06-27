/**
 * batchSignal.ts — Phase 4.3: detect adverse signals at the grow_batch level.
 *
 * Flagging is deliberately conservative:
 *   - Minimum n = 5 reports per axis before any flag is considered
 *   - Adverse rate must exceed 60% on the axis
 *   - A flagged batch is never propagated to the whole strain
 *
 * Cultivation meta-signal: if ≥2 flagged batches share a cultivation_method
 * on the same axis, that's a systemic signal (e.g., "greenhouse batches show
 * low anti-anxiety for this genetics"). Only reported, never auto-blocks.
 */

import type { EffectAxis, AxialReport, FlaggedBatch, CultivationMethod } from './types.ts';

const MIN_FLAG_N        = 5;    // minimum reports before a batch can be flagged
const ADVERSE_THRESHOLD = 0.4;  // score < this is considered "adverse"
const ADVERSE_RATE_MIN  = 0.6;  // at least 60% of reports must be adverse

/**
 * Detect flagged batches from a flat list of per-report signals.
 * Aggregation is done internally (caller does NOT need to pre-aggregate).
 *
 * @param reports  - one entry per individual user report
 * @returns        - array of flagged batches (may be empty)
 */
export function flagBatches(reports: AxialReport[]): FlaggedBatch[] {
  // Group: batchId+axis → { items[], cultivationMethods[] }
  // Q11: trust weights used for weighted adverse rate. Raw count used for MIN_FLAG_N
  // (need ≥5 actual reports before any flag; effective-N check would require 50 anon reports).
  const groups = new Map<string, {
    items: { score: number; weight: number }[];
    methods: Set<CultivationMethod | undefined>;
  }>();

  for (const r of reports) {
    const key = `${r.batchId}::${r.axis}`;
    if (!groups.has(key)) groups.set(key, { items: [], methods: new Set() });
    const g = groups.get(key)!;
    g.items.push({ score: r.score, weight: r.trustWeight ?? 1.0 });
    g.methods.add(r.cultivationMethod);
  }

  const flagged: FlaggedBatch[] = [];

  for (const [key, { items, methods }] of groups) {
    const [batchId, axis] = key.split('::') as [string, EffectAxis];
    const n = items.length; // raw count for minimum-reports gate
    if (n < MIN_FLAG_N) continue;

    // Weighted adverse rate: anonymous trolls (weight 0.10) can't drive the rate
    // to the 60% threshold unless they dominate by 10× over verified reports.
    const totalWeight        = items.reduce((s, i) => s + i.weight, 0);
    const adverseWeightedSum = items.reduce((s, i) => s + (i.score < ADVERSE_THRESHOLD ? i.weight : 0), 0);
    const adverseRate        = totalWeight > 0 ? adverseWeightedSum / totalWeight : 0;
    if (adverseRate < ADVERSE_RATE_MIN) continue;

    flagged.push({
      batchId,
      axis,
      n,
      adverseRate,
    });
  }

  // Cultivation meta-signal: find axes where ≥2 flagged batches share a method
  if (flagged.length >= 2) {
    const axisMethods = new Map<string, Map<CultivationMethod, number>>();

    for (const r of reports) {
      if (!r.cultivationMethod) continue;
      const isFlagged = flagged.some(f => f.batchId === r.batchId && f.axis === r.axis);
      if (!isFlagged) continue;

      if (!axisMethods.has(r.axis)) axisMethods.set(r.axis, new Map());
      const axisMap = axisMethods.get(r.axis)!;
      axisMap.set(r.cultivationMethod, (axisMap.get(r.cultivationMethod) ?? 0) + 1);
    }

    for (const fb of flagged) {
      const axisMap = axisMethods.get(fb.axis);
      if (!axisMap) continue;
      for (const [method, count] of axisMap) {
        if (count >= 2) { fb.cultivationSignal = method; break; }
      }
    }
  }

  return flagged;
}

/**
 * Aggregate AxialReport[] into a BatchReportMap (n, mean) per batch.
 * Used to derive the community ReportAggregate from raw per-report data.
 * Aggregation is axis-agnostic: mean is across all axes for the batch.
 *
 * Q11: Uses trust-weighted aggregation.
 *   n    = effective N (sum of trust weights). Feeds into scorer.ts Bayesian k=8.
 *          A ring of 80 anonymous reports (weight 0.10 each) = effectiveN 8 — same
 *          as 8 fully-verified reports, well within the prior-dominant regime.
 *   mean = trust-weighted mean score.
 * Reports without trustWeight default to 1.0 (backwards-compatible with unweighted callers).
 */
export function aggregateByBatch(reports: AxialReport[]): import('./types').BatchReportMap {
  const map = new Map<string, { weightedSum: number; effectiveN: number }>();
  for (const r of reports) {
    if (!map.has(r.batchId)) map.set(r.batchId, { weightedSum: 0, effectiveN: 0 });
    const agg    = map.get(r.batchId)!;
    const weight = r.trustWeight ?? 1.0;
    agg.weightedSum += r.score * weight;
    agg.effectiveN  += weight;
  }
  const out: import('./types').BatchReportMap = {};
  for (const [batchId, { weightedSum, effectiveN }] of map) {
    out[batchId] = {
      n:    effectiveN,
      mean: effectiveN > 0 ? weightedSum / effectiveN : 0,
    };
  }
  return out;
}
