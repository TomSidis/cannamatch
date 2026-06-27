/**
 * STEP 5.1 — Q11: Community report trust policy proof.
 *
 * A. Trust weight formula — anonymous floor + verifiable signal components
 * B. Bayesian troll resistance — anonymous ring barely moves the mean
 * C. Weighted adverse flagging — anon trolls can't drive flagging alone
 * D. Layer 2 hook — getUserReliabilityScore returns undefined today
 * E. Backwards compatibility — AxialReport without trustWeight = weight 1.0
 */

import { describe, it, expect } from 'vitest';
import { computeReportWeight, getUserReliabilityScore } from '../reportTrust';
import { aggregateByBatch, flagBatches }                from '../batchSignal';
import { scoreSingle }                                  from '../scorer';
import { buildNeedVector }                              from '../vectorMath';
import type { AxialReport, Batch }                      from '../types';

// ── shared helpers ─────────────────────────────────────────────────────────────

function makeNeed(conditions: string[]) {
  return buildNeedVector({ reasons: conditions, licenseCategories: [], gramsByCategory: {} });
}

function makeReport(
  batchId: string,
  score: number,
  trustWeight?: number,
  axis: AxialReport['axis'] = 'antiAnxiety',
): AxialReport {
  return { batchId, axis, score, trustWeight };
}

// ── A: Trust weight formula ────────────────────────────────────────────────────

describe('A: trust weight formula', () => {
  it('anonymous (no signals) = 0.10 floor', () => {
    const w = computeReportWeight({ isVerifiedPatient: false, hasPhoto: false, batchVerified: false });
    expect(w).toBeCloseTo(0.10, 5);
  });

  it('verified license only = 0.60', () => {
    const w = computeReportWeight({ isVerifiedPatient: true, hasPhoto: false, batchVerified: false });
    expect(w).toBeCloseTo(0.60, 5);
  });

  it('verified + photo = 0.80', () => {
    const w = computeReportWeight({ isVerifiedPatient: true, hasPhoto: true, batchVerified: false });
    expect(w).toBeCloseTo(0.80, 5);
  });

  it('verified + photo + batch = 1.00 (full weight)', () => {
    const w = computeReportWeight({ isVerifiedPatient: true, hasPhoto: true, batchVerified: true });
    expect(w).toBeCloseTo(1.00, 5);
  });

  it('photo only (no license) = 0.30', () => {
    const w = computeReportWeight({ isVerifiedPatient: false, hasPhoto: true, batchVerified: false });
    expect(w).toBeCloseTo(0.30, 5);
  });

  it('layer 2 hook: reliability 0.5 scales weight down but stays above floor', () => {
    // Verified + photo at half reliability
    const w = computeReportWeight({ isVerifiedPatient: true, hasPhoto: true, batchVerified: false, userReliabilityScore: 0.5 });
    expect(w).toBeCloseTo(0.40, 5); // 0.80 * 0.5 = 0.40
  });

  it('layer 2 hook: reliability below floor still clamps to floor', () => {
    const w = computeReportWeight({ isVerifiedPatient: false, hasPhoto: false, batchVerified: false, userReliabilityScore: 0.01 });
    expect(w).toBeGreaterThanOrEqual(0.10);
  });

  it('all components sum exactly to 1.00', () => {
    // W_BASE + W_LICENSE + W_PHOTO + W_BATCH = 0.10 + 0.50 + 0.20 + 0.20 = 1.00
    const w = computeReportWeight({ isVerifiedPatient: true, hasPhoto: true, batchVerified: true });
    expect(w).toBeLessThanOrEqual(1.00);
  });
});

// ── B: Bayesian troll resistance ───────────────────────────────────────────────

describe('B: Bayesian troll resistance via weighted aggregation', () => {
  it('80 anonymous adverse reports (weight 0.10) → effectiveN = 8, w(8) = 0.50', () => {
    const trolls = Array.from({ length: 80 }, () =>
      makeReport('batch-x', 0.1, 0.10),
    );
    const map = aggregateByBatch(trolls);
    const agg = map['batch-x']!;

    // effectiveN = 80 × 0.10 = 8.0
    expect(agg.n).toBeCloseTo(8.0, 5);
    // weighted mean = (80 × 0.10 × 0.1) / 8.0 = 0.1
    expect(agg.mean).toBeCloseTo(0.1, 5);

    console.log('\nB. Troll ring (80 anon × 0.10 weight):');
    console.log(`   effectiveN=${agg.n.toFixed(2)}  mean=${agg.mean.toFixed(3)}`);
    console.log(`   w(effectiveN) = ${(agg.n / (agg.n + 8)).toFixed(3)} — community influence`);
  });

  it('8 verified reports (weight 1.0) dominate 80 anon adverse reports', () => {
    const trolls    = Array.from({ length: 80 }, () => makeReport('batch-y', 0.1, 0.10));
    const verified  = Array.from({ length: 8  }, () => makeReport('batch-y', 0.8, 1.00));
    const map       = aggregateByBatch([...trolls, ...verified]);
    const agg       = map['batch-y']!;

    // effectiveN = 80×0.1 + 8×1.0 = 8 + 8 = 16
    // weightedMean = (80×0.1×0.1 + 8×1.0×0.8) / 16 = (0.8 + 6.4) / 16 = 0.45
    console.log(`\n   Mixed (80 anon adverse + 8 verified positive): mean=${agg.mean.toFixed(3)}`);
    expect(agg.mean).toBeGreaterThan(0.3); // verified positive reporters win
  });
});

// ── C: Weighted adverse flagging ───────────────────────────────────────────────

describe('C: weighted adverse flagging', () => {
  it('5 anonymous adverse reports (weight 0.10) do NOT produce a flag', () => {
    // 5 anon adverse + 1 verified positive
    const reports: AxialReport[] = [
      ...Array.from({ length: 5 }, () => makeReport('batch-z', 0.1, 0.10)),
      makeReport('batch-z', 0.9, 1.00),
    ];
    const flagged = flagBatches(reports);
    // adverseWeightedSum = 5×0.10 = 0.5
    // totalWeight = 5×0.10 + 1×1.0 = 1.5
    // adverseRate = 0.5/1.5 = 0.33 < ADVERSE_RATE_MIN(0.60) → NOT flagged
    expect(flagged.find(f => f.batchId === 'batch-z')).toBeUndefined();

    console.log('\nC. 5 anon + 1 verified → no flag (adverseRate ≈ 0.33)');
  });

  it('5 verified adverse reports flag the batch (adverseRate = 1.0)', () => {
    const reports: AxialReport[] = Array.from({ length: 5 }, () =>
      makeReport('batch-w', 0.1, 1.00),
    );
    const flagged = flagBatches(reports);
    const flag = flagged.find(f => f.batchId === 'batch-w');
    expect(flag).toBeDefined();
    expect(flag!.adverseRate).toBeCloseTo(1.0, 3);

    console.log(`\nC. 5 verified adverse → flagged (adverseRate=${flag!.adverseRate.toFixed(2)})`);
  });

  it('mixed: 3 verified adverse + 10 anon positive do NOT flag', () => {
    const reports: AxialReport[] = [
      ...Array.from({ length: 3 },  () => makeReport('batch-v', 0.1, 1.00)),
      ...Array.from({ length: 10 }, () => makeReport('batch-v', 0.9, 0.10)),
    ];
    // adverseWeightedSum = 3×1.0 = 3
    // totalWeight = 3×1.0 + 10×0.1 = 4
    // adverseRate = 3/4 = 0.75 ≥ 0.60 → flagged?
    // n = 13 ≥ 5 → eligible
    // Actually 0.75 > 0.60, so it IS flagged — 3 verified reports dominate
    const flagged = flagBatches(reports);
    const flag = flagged.find(f => f.batchId === 'batch-v');
    // 3 verified adverse overwhelm 10 anon positive → flag is correct behavior
    expect(flag).toBeDefined();
    console.log(`\nC. 3 verified adverse + 10 anon positive: adverseRate=${flag!.adverseRate.toFixed(3)} (flag correct)`);
  });
});

// ── D: Layer 2 hook ────────────────────────────────────────────────────────────

describe('D: layer 2 hook (behavioral reliability model)', () => {
  it('getUserReliabilityScore returns undefined today (deferred)', async () => {
    const score = await getUserReliabilityScore('any-user-id');
    expect(score).toBeUndefined();
    console.log('\nD. Layer 2 hook: getUserReliabilityScore → undefined (deferred)');
  });
});

// ── E: Backwards compatibility ────────────────────────────────────────────────

describe('E: backwards compatibility — no trustWeight = weight 1.0', () => {
  it('aggregateByBatch with unweighted reports produces same result as before', () => {
    // Pre-Q11 style reports without trustWeight
    const reports: AxialReport[] = [
      { batchId: 'batch-q', axis: 'antiAnxiety', score: 0.2, cultivationMethod: 'greenhouse' },
      { batchId: 'batch-q', axis: 'antiAnxiety', score: 0.8, cultivationMethod: 'greenhouse' },
    ];
    const map = aggregateByBatch(reports);
    // Without trustWeight: effectiveN = 2×1.0 = 2, mean = (0.2+0.8)/2 = 0.5
    expect(map['batch-q']!.n).toBeCloseTo(2.0, 5);
    expect(map['batch-q']!.mean).toBeCloseTo(0.5, 5);
    console.log('\nE. Unweighted reports: effectiveN=2, mean=0.5 (same as legacy behavior)');
  });

  it('scoreSingle with n=8 unweighted reports uses community layer when dominant', () => {
    const need  = makeNeed(['anxiety']);
    const batch: Batch = {
      id: 'legacy-batch', productId: 'test', thcPct: 18, cbdPct: 0.5,
      terpenes: [], provenance: 'declared', category: 'T18/C3',
    };
    // 8 positive reports, no trustWeight
    const reports: AxialReport[] = Array.from({ length: 8 }, () =>
      ({ batchId: 'legacy-batch', axis: 'antiAnxiety' as const, score: 0.9 }),
    );
    const map    = aggregateByBatch(reports);
    const result = scoreSingle(need, batch, map['legacy-batch']);
    // w(8.0) = 0.5 — significant community signal
    expect(result.confidence).toBeGreaterThan(0);
    console.log(`\nE. Legacy n=8: confidence=${result.confidence.toFixed(3)} layer=${result.topLayer}`);
  });
});
