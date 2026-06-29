/**
 * twins.ts — B5 out-of-stock substitution.
 *
 * Twin hierarchy (priority order):
 *   1. same_genetics  — same genetics_node.id (identical strain, different marketer)
 *   2. similar_terpenes — same chemotype + ≥1 overlapping dominant terpene
 *   3. near_chemotype   — same chemotype only
 *
 * Price is NEVER included in TwinCandidate. The menu row shows:
 *   commercial name | match % | reasonHuman
 */

import { scoreSingle } from './scorer.ts';
import { chemotypeFromBatch } from './vectorMath.ts';
import type { Batch, UserNeed, TwinCandidate, BatchReportMap } from './types.ts';

const REASON_LABELS: Record<TwinCandidate['twinReason'], string> = {
  same_genetics:    'גנטיקה זהה, מותג אחר',
  similar_terpenes: 'פרופיל טרפנים דומה',
  near_chemotype:   'כימוטיפ דומה',
};

function reasonFor(a: Batch, b: Batch): TwinCandidate['twinReason'] | null {
  if (a.geneticsId && b.geneticsId && a.geneticsId === b.geneticsId) return 'same_genetics';
  if (chemotypeFromBatch(a) !== chemotypeFromBatch(b)) return null;
  if (hasOverlappingTerpenes(a, b)) return 'similar_terpenes';
  return 'near_chemotype';
}

function hasOverlappingTerpenes(a: Batch, b: Batch): boolean {
  if (!a.terpenes.length || !b.terpenes.length) return false;
  const aSet = new Set(a.terpenes.map(r => r.terpene));
  return b.terpenes.some(r => aSet.has(r.terpene));
}

const REASON_PRIORITY: Record<TwinCandidate['twinReason'], number> = {
  same_genetics: 2, similar_terpenes: 1, near_chemotype: 0,
};

/**
 * Find available substitutes for an OOS batch.
 *
 * @param unavailable  The batch the user wants but can't get.
 * @param candidates   All batches in scope (pharmacy menu). OOS ones are silently skipped.
 * @param need         User need vector (same as used for the original recommendation).
 * @param reportMap    Community reports for confidence blending.
 */
export function findTwinSubstitutes(
  unavailable: Batch,
  candidates: Batch[],
  need: UserNeed,
  reportMap: BatchReportMap = {},
): TwinCandidate[] {
  const results: TwinCandidate[] = [];

  for (const batch of candidates) {
    if (batch.id === unavailable.id) continue;
    if (batch.inStock === false) continue;

    const reason = reasonFor(unavailable, batch);
    if (!reason) continue;

    const scored = scoreSingle(need, batch, reportMap[batch.id] ?? { n: 0, mean: 0 });

    results.push({
      batchId: batch.id,
      productId: batch.productId,
      commercialName: batch.commercialName ?? batch.productId,
      matchPct: scored.matchPct,
      confidence: scored.confidence,
      twinReason: reason,
      reasonHuman: REASON_LABELS[reason],
    });
  }

  return results.sort((a, b) => {
    const pd = REASON_PRIORITY[b.twinReason] - REASON_PRIORITY[a.twinReason];
    return pd !== 0 ? pd : b.matchPct - a.matchPct;
  });
}
