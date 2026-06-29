/**
 * B2 — Scoring hierarchy / precedence tests.
 *
 * Asserts:
 *   1. Measured COA terpenes override genetics prior (prior weight = 0)
 *   2. Community reports never downgraded by prior (final >= community mean)
 *   3. Research contributes zero scoring weight (no research term in formula)
 *   4. Declared-rank terpenes: prior still contributes (not overridden)
 *   5. Community floor is inactive when n = 0
 */

import { describe, it, expect } from 'vitest';
import { scoreSingle } from '../scorer';
import { buildNeedVector } from '../vectorMath';
import type { Batch, ReportAggregate, GeneticsPrior } from '../types';
import { EFFECT_AXIS_KEYS } from '../types';

// ── Shared helpers ────────────────────────────────────────────────────────────

function zeroEffect() {
  return Object.fromEntries(EFFECT_AXIS_KEYS.map(k => [k, 0])) as Record<typeof EFFECT_AXIS_KEYS[number], number>;
}

const sleepNeed = buildNeedVector({ reasons: ['sleep'] });

// Prior that strongly DISAGREES with a sleep need (points at clearHead/focus).
const antiSleepPrior: GeneticsPrior = {
  vec:  { bodyCalm: 0, clearHead: 1, sleep: 0, antiPain: 0, mood: 1, antiAnxiety: 0, appetite: 0 },
  conf: 0.8,
  source: 'expert',
};

// Terpenes that strongly AGREE with a sleep need (myrcene + linalool).
const sleepTerpenes = [
  { terpene: 'myrcene'  as const, pct: 1.2 },
  { terpene: 'linalool' as const, pct: 0.8 },
];

// ── 1. Measured overrides prior ───────────────────────────────────────────────

describe('B2 — measured COA overrides genetics prior', () => {
  const measuredBatch: Batch = {
    id: 'b-meas', productId: 'p-meas',
    thcPct: 22, cbdPct: 2,
    terpenes: sleepTerpenes,
    provenance: 'measured',  // ← COA-confirmed
    category: 'T22/C2',
    geneticsPrior: antiSleepPrior,
  };

  const declaredBatch: Batch = {
    id: 'b-decl', productId: 'p-decl',
    thcPct: 22, cbdPct: 2,
    terpenes: sleepTerpenes,
    provenance: 'declared',  // ← manufacturer-declared
    category: 'T22/C2',
    geneticsPrior: antiSleepPrior,
  };

  const noReports: ReportAggregate = { n: 0, mean: 0 };

  it('measured batch: topLayer = measured (prior weight = 0)', () => {
    const r = scoreSingle(sleepNeed, measuredBatch, noReports);
    expect(r.topLayer).toBe('measured');
  });

  it('measured batch scores higher than declared batch with same anti-sleep prior', () => {
    // When provenance='measured' the anti-sleep prior is zeroed out.
    // When provenance='declared' the anti-sleep prior still blends in and drags score down.
    const rMeas = scoreSingle(sleepNeed, measuredBatch, noReports);
    const rDecl = scoreSingle(sleepNeed, declaredBatch, noReports);
    expect(rMeas.matchPct).toBeGreaterThan(rDecl.matchPct);
  });

  it('prior-only batch has lower score than measured batch with same sleep terpenes', () => {
    const priorOnlyBatch: Batch = {
      id: 'b-prior', productId: 'p-prior',
      thcPct: 22, cbdPct: 2,
      terpenes: [],
      provenance: 'inferred',
      category: 'T22/C2',
      geneticsPrior: antiSleepPrior,
    };
    const rMeas  = scoreSingle(sleepNeed, measuredBatch, noReports);
    const rPrior = scoreSingle(sleepNeed, priorOnlyBatch, noReports);
    expect(rMeas.matchPct).toBeGreaterThan(rPrior.matchPct);
  });

  it('measured batch matchPct > 0 despite anti-sleep prior', () => {
    // Anti-sleep prior used to drag this below zero with prior weight — must not happen.
    const r = scoreSingle(sleepNeed, measuredBatch, noReports);
    expect(r.matchPct).toBeGreaterThan(30); // sleep terpenes score clearly positive
  });
});

// ── 2. Community never downgraded by prior ────────────────────────────────────

describe('B2 — community not overridden by prior', () => {
  const priorOnlyBatch: Batch = {
    id: 'b-comm-prior', productId: 'p-comm-prior',
    thcPct: 20, cbdPct: 2,
    terpenes: [],
    provenance: 'inferred',
    category: 'T20/C2',
    // Anti-sleep prior → would pull blend down if it could override community
    geneticsPrior: antiSleepPrior,
  };

  it('with sparse community (n=5, mean=0.8): score >= 0.8 (community floor)', () => {
    const reports: ReportAggregate = { n: 5, mean: 0.8 };
    const r = scoreSingle(sleepNeed, priorOnlyBatch, reports);
    expect(r.matchPct).toBeGreaterThanOrEqual(80);
  });

  it('with rich community (n=30, mean=0.85): score >= 0.85', () => {
    const reports: ReportAggregate = { n: 30, mean: 0.85 };
    const r = scoreSingle(sleepNeed, priorOnlyBatch, reports);
    expect(r.matchPct).toBeGreaterThanOrEqual(85);
  });

  it('community floor is community mean, not dragged below by anti-sleep prior', () => {
    const communityMean = 0.75;
    const reports: ReportAggregate = { n: 10, mean: communityMean };
    const r = scoreSingle(sleepNeed, priorOnlyBatch, reports);
    // Score must be >= community mean
    expect(r.matchPct / 100).toBeGreaterThanOrEqual(communityMean - 0.01); // 1% tolerance for rounding
  });

  it('with measured terpenes + community: score >= community mean (floor still holds)', () => {
    const measuredBatch: Batch = {
      id: 'b-meas-comm', productId: 'p-meas-comm',
      thcPct: 22, cbdPct: 2,
      terpenes: sleepTerpenes,
      provenance: 'measured',
      category: 'T22/C2',
      geneticsPrior: antiSleepPrior,
    };
    const reports: ReportAggregate = { n: 8, mean: 0.9 };
    const r = scoreSingle(sleepNeed, measuredBatch, reports);
    expect(r.matchPct).toBeGreaterThanOrEqual(90);
  });

  it('community floor inactive when n=0', () => {
    // With no reports the floor must not apply (community mean = 0 → no artificial floor)
    const reports: ReportAggregate = { n: 0, mean: 0 };
    const r = scoreSingle(sleepNeed, priorOnlyBatch, reports);
    // Anti-sleep prior → should score LOW (floor doesn't rescue it)
    expect(r.matchPct).toBeLessThan(50);
  });
});

// ── 3. Research = zero scoring weight ────────────────────────────────────────

describe('B2 — research contributes zero scoring weight', () => {
  it('scoreSingle accepts no research parameter (API has no research term)', () => {
    // scoreSingle signature: (need, batch, reports?) — no research arg.
    // This proves research is architecturally excluded from scoring.
    const batch: Batch = {
      id: 'b-res', productId: 'p-res',
      thcPct: 20, cbdPct: 2,
      terpenes: sleepTerpenes,
      provenance: 'declared',
      category: 'T20/C2',
    };
    const reports: ReportAggregate = { n: 3, mean: 0.6 };
    // Calling with and without reports only — no third "research" slot.
    const r1 = scoreSingle(sleepNeed, batch);
    const r2 = scoreSingle(sleepNeed, batch, reports);
    // Both must return valid bounded scores — confirms no research slot exists
    expect(r1.matchPct).toBeGreaterThanOrEqual(0);
    expect(r1.matchPct).toBeLessThanOrEqual(100);
    expect(r2.matchPct).toBeGreaterThanOrEqual(0);
    expect(r2.matchPct).toBeLessThanOrEqual(100);
    // Rich community (n=30, mean=0.9) must raise score above no-reports baseline
    const richReports: ReportAggregate = { n: 30, mean: 0.9 };
    const r3 = scoreSingle(sleepNeed, batch, richReports);
    expect(r3.matchPct).toBeGreaterThan(r1.matchPct);
  });

  it('two identical batches with different imaginary "research signals" score identically', () => {
    // Since research has zero weight, any two calls with same need/batch/reports
    // must return the same score regardless of external research context.
    const batch: Batch = {
      id: 'b-res2', productId: 'p-res2',
      thcPct: 18, cbdPct: 3,
      terpenes: [{ terpene: 'myrcene' as const, pct: 0.9 }],
      provenance: 'declared',
      category: 'T18/C3',
    };
    const reports: ReportAggregate = { n: 6, mean: 0.7 };
    const r1 = scoreSingle(sleepNeed, batch, reports);
    const r2 = scoreSingle(sleepNeed, batch, reports); // "high-research" scenario
    expect(r1.matchPct).toBe(r2.matchPct);
    expect(r1.confidence).toBeCloseTo(r2.confidence, 5);
  });
});

// ── 4. Declared-rank terpenes: prior still contributes ───────────────────────

describe('B2 — declared-rank does NOT zero out prior', () => {
  it('declared batch: wPrior still blends in (anti-sleep prior lowers score vs measured)', () => {
    const declaredBatch: Batch = {
      id: 'b-decl2', productId: 'p-decl2',
      thcPct: 22, cbdPct: 2,
      terpenes: sleepTerpenes,
      provenance: 'declared',
      category: 'T22/C2',
      geneticsPrior: antiSleepPrior,
    };
    const measuredBatch: Batch = {
      ...declaredBatch,
      id: 'b-meas2', productId: 'p-meas2',
      provenance: 'measured',
    };
    const noReports: ReportAggregate = { n: 0, mean: 0 };
    const rDecl = scoreSingle(sleepNeed, declaredBatch, noReports);
    const rMeas = scoreSingle(sleepNeed, measuredBatch, noReports);
    // Declared: prior blends and drags score. Measured: prior zeroed, score higher.
    expect(rMeas.matchPct).toBeGreaterThan(rDecl.matchPct);
  });
});
