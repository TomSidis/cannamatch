/**
 * B3 — Two-layer cross derivation + license guard + single-pick fix.
 *
 * 1. Cross derivation:
 *    - Cannabinoid (Mendelian): strong conf, correct predicted type
 *    - Terpene (phenotype): weak conf (≤ 0.30), flagged
 *
 * 2. License guard:
 *    - License-only input → hasMinimumSignal = false
 *    - At least one real signal → true
 *
 * 3. Single-pick decay:
 *    - One form pick does not dominate results (scores cluster)
 *    - A real condition creates clear differentiation (scores spread)
 */

import { describe, it, expect } from 'vitest';
import { deriveCross }                  from '../genetics';
import type { CrossPrior }              from '../genetics';
import { buildNeedVector, hasMinimumSignal } from '../vectorMath';
import { scoreSingle }                  from '../scorer';
import type { GeneticsNode, Batch, ReportAggregate } from '../types';

// ── Fixture nodes ─────────────────────────────────────────────────────────────

const typeI: GeneticsNode = {
  id: 'fixture-type-i', displayName: 'THC Dominant', aliases: [],
  nodeType: 'landrace', priorSource: 'expert', priorConf: 0.70,
  topTerpenes: ['limonene', 'terpinolene'],
  effectVec: { clearHead: 0.9, mood: 0.8, bodyCalm: 0.2, antiAnxiety: 0.2, sleep: 0.1, antiPain: 0.3, appetite: 0.3 },
  chemotype: 'thcDominant',
};

const typeIII: GeneticsNode = {
  id: 'fixture-type-iii', displayName: 'CBD Dominant', aliases: [],
  nodeType: 'landrace', priorSource: 'expert', priorConf: 0.70,
  topTerpenes: ['linalool', 'myrcene'],
  effectVec: { bodyCalm: 0.9, antiAnxiety: 0.8, sleep: 0.7, antiPain: 0.5, clearHead: 0.2, mood: 0.2, appetite: 0.2 },
  chemotype: 'cbdDominant',
};

const typeIBalanced: GeneticsNode = {
  id: 'fixture-type-ii', displayName: 'Balanced', aliases: [],
  nodeType: 'hybrid', priorSource: 'expert', priorConf: 0.60,
  topTerpenes: ['myrcene', 'caryophyllene'],
  effectVec: { bodyCalm: 0.6, antiAnxiety: 0.6, mood: 0.6, clearHead: 0.6, sleep: 0.4, antiPain: 0.4, appetite: 0.3 },
  chemotype: 'balanced',
};

const noVecNode: GeneticsNode = {
  id: 'fixture-no-vec', displayName: 'Unknown', aliases: [],
  nodeType: 'hybrid', priorSource: 'placeholder', priorConf: 0,
  topTerpenes: [],
  // no effectVec, no chemotype
};

const noReports: ReportAggregate = { n: 0, mean: 0 };

// ── Fixture batches for scoring ───────────────────────────────────────────────

const sleepBatch: Batch = {
  id: 'b-sleep', productId: 'p-sleep',
  thcPct: 22, cbdPct: 4,
  terpenes: [{ terpene: 'myrcene', pct: 1.2 }, { terpene: 'linalool', pct: 0.8 }],
  provenance: 'declared', category: 'T22/C4',
};

const focusBatch: Batch = {
  id: 'b-focus', productId: 'p-focus',
  thcPct: 15, cbdPct: 2,
  terpenes: [{ terpene: 'limonene', pct: 1.0 }, { terpene: 'pinene', pct: 0.7 }],
  provenance: 'declared', category: 'T15/C2',
};

const painBatch: Batch = {
  id: 'b-pain', productId: 'p-pain',
  thcPct: 18, cbdPct: 6,
  terpenes: [{ terpene: 'caryophyllene', pct: 1.1 }, { terpene: 'humulene', pct: 0.5 }],
  provenance: 'declared', category: 'T18/C6',
};

const genericBatch: Batch = {
  id: 'b-generic', productId: 'p-generic',
  thcPct: 20, cbdPct: 3,
  terpenes: [],
  provenance: 'inferred', category: 'T20/C3',
};

const allBatches: Batch[] = [sleepBatch, focusBatch, painBatch, genericBatch];

// ── 1a. Cross derivation — cannabinoid (Mendelian / strong) ──────────────────

describe('B3 — cross derivation: cannabinoid prior (Mendelian, strong)', () => {
  it('Type I × Type III → balanced (Type II), conf >= 0.55', () => {
    const r = deriveCross(typeI, typeIII);
    expect(r.cannabinoidPrior.chemotype).toBe('balanced');
    expect(r.cannabinoidPrior.conf).toBeGreaterThanOrEqual(0.55);
  });

  it('Type III × Type I → balanced (commutative)', () => {
    const r = deriveCross(typeIII, typeI);
    expect(r.cannabinoidPrior.chemotype).toBe('balanced');
    expect(r.cannabinoidPrior.conf).toBeGreaterThanOrEqual(0.55);
  });

  it('Type I × Type I → thcDominant, conf >= 0.65 (like × like)', () => {
    const r = deriveCross(typeI, typeI);
    expect(r.cannabinoidPrior.chemotype).toBe('thcDominant');
    expect(r.cannabinoidPrior.conf).toBeGreaterThanOrEqual(0.65);
  });

  it('Type III × Type III → cbdDominant, conf >= 0.65', () => {
    const r = deriveCross(typeIII, typeIII);
    expect(r.cannabinoidPrior.chemotype).toBe('cbdDominant');
    expect(r.cannabinoidPrior.conf).toBeGreaterThanOrEqual(0.65);
  });

  it('Type I × balanced → thcDominant (extreme lean), conf < 0.55 (uncertain)', () => {
    const r = deriveCross(typeI, typeIBalanced);
    expect(r.cannabinoidPrior.chemotype).toBe('thcDominant');
    expect(r.cannabinoidPrior.conf).toBeLessThan(0.55);
  });

  it('unknown parent → conf <= 0.30 (insufficient data)', () => {
    const r = deriveCross(typeI, noVecNode);
    expect(r.cannabinoidPrior.conf).toBeLessThanOrEqual(0.30);
  });

  it('cannabinoid conf > terpene conf for same cross', () => {
    const r = deriveCross(typeI, typeIII);
    expect(r.cannabinoidPrior.conf).toBeGreaterThan(r.terpenePrior.conf);
  });
});

// ── 1b. Cross derivation — terpene prior (phenotype / weak, flagged) ─────────

describe('B3 — cross derivation: terpene prior (phenotype, weak, flagged)', () => {
  it('terpene prior conf <= 0.30 for high-conf parents', () => {
    const r = deriveCross(typeI, typeIII);
    expect(r.terpenePrior.conf).toBeLessThanOrEqual(0.30);
  });

  it('terpene prior is always flagged: true', () => {
    const r1 = deriveCross(typeI, typeIII);
    const r2 = deriveCross(typeI, typeI);
    const r3 = deriveCross(typeI, noVecNode);
    expect(r1.terpenePrior.flagged).toBe(true);
    expect(r2.terpenePrior.flagged).toBe(true);
    expect(r3.terpenePrior.flagged).toBe(true);
  });

  it('terpene prior source = derived', () => {
    const r = deriveCross(typeI, typeIII);
    expect(r.terpenePrior.source).toBe('derived');
  });

  it('terpene prior vec is blend of parent vecs (bodyCalm between parent values)', () => {
    const r = deriveCross(typeI, typeIII);
    // typeI bodyCalm=0.2, typeIII bodyCalm=0.9 → blend ≈ 0.55
    expect(r.terpenePrior.vec.bodyCalm).toBeGreaterThan(0.3);
    expect(r.terpenePrior.vec.bodyCalm).toBeLessThan(0.8);
  });

  it('terpene prior with unknown parent → conf near 0', () => {
    const r = deriveCross(typeI, noVecNode);
    // noVecNode has priorConf=0 → mean × 0.6 → conf ≈ 0.21 (typeI=0.70, noVec=0)
    expect(r.terpenePrior.conf).toBeLessThanOrEqual(0.30);
    expect(r.terpenePrior.flagged).toBe(true);
  });
});

// ── 2. License guard ──────────────────────────────────────────────────────────

describe('B3 — hasMinimumSignal: license is eligibility only', () => {
  it('license-only → false (no preference signal)', () => {
    // No reasons, timing, killSwitches, terpWeights, or form picks
    expect(hasMinimumSignal({})).toBe(false);
    expect(hasMinimumSignal({ reasons: [], timing: [], killSwitches: [], form: [] })).toBe(false);
  });

  it('license + one reason → true', () => {
    expect(hasMinimumSignal({ reasons: ['sleep'] })).toBe(true);
  });

  it('explicit timing → true', () => {
    expect(hasMinimumSignal({ timing: ['evening'] })).toBe(true);
  });

  it('killSwitch (avoidance terpene) → true', () => {
    expect(hasMinimumSignal({ killSwitches: ['myrcene'] })).toBe(true);
  });

  it('terpWeights preference → true', () => {
    expect(hasMinimumSignal({ terpWeights: { limonene: 0.8 } })).toBe(true);
  });

  it('one form pick (tried strain) → true', () => {
    expect(hasMinimumSignal({ form: ['Hindu Kush'] })).toBe(true);
  });

  it('indication alone (no license info) → true', () => {
    // "indication" = reasons = goals; spec says "indication alone insufficient" only
    // when paired with license-only. A reason IS a valid preference signal.
    expect(hasMinimumSignal({ reasons: ['pain'] })).toBe(true);
  });

  it('license + form pick scores produce valid matchPct (signal present)', () => {
    const need = buildNeedVector({ licenseCategories: ['T22/C4'], form: ['Hindu Kush'] });
    const r = scoreSingle(need, sleepBatch, noReports);
    // Must produce a real score (not 0 from zero-vector), because form pick IS a signal
    expect(r.matchPct).toBeGreaterThan(0);
  });
});

// ── 3. Single-pick is a weak signal, not an anchor ───────────────────────────

describe('B3 — single form pick does not dominate results', () => {
  it('one form pick: score spread across batches < 40 pts (weak signal, scores cluster)', () => {
    // 'Hindu Kush' is a known genetics node with bodyCalm/sleep profile.
    // At 0.3× weight it creates a gentle nudge, not a dominant filter.
    const need = buildNeedVector({ form: ['Hindu Kush'] });
    const scores = allBatches.map(b => scoreSingle(need, b, noReports).matchPct);
    const spread = Math.max(...scores) - Math.min(...scores);
    expect(spread).toBeLessThan(40);  // no single batch dominates with a one-pick signal
  });

  it('strong condition: score spread >= 20 pts (clear differentiation)', () => {
    const need = buildNeedVector({ reasons: ['sleep'] });
    const scores = allBatches.map(b => scoreSingle(need, b, noReports).matchPct);
    const spread = Math.max(...scores) - Math.min(...scores);
    expect(spread).toBeGreaterThanOrEqual(20);  // sleep condition creates real spread
  });

  it('one form pick + real condition: condition-driven batch outperforms pick-only batch', () => {
    // sleep condition + HK pick: sleep-profile batches still win because condition=1.0 > pick=0.3
    const need = buildNeedVector({ reasons: ['sleep'], form: ['Hindu Kush'] });
    const rSleep  = scoreSingle(need, sleepBatch,  noReports);
    const rFocus  = scoreSingle(need, focusBatch,  noReports);
    expect(rSleep.matchPct).toBeGreaterThan(rFocus.matchPct);
  });

  it('unknown form pick (not in genetics map) → graceful skip, still scores', () => {
    const need = buildNeedVector({ form: ['NonExistentStrainXYZ123'] });
    const r = scoreSingle(need, sleepBatch, noReports);
    // Unknown strain resolves to null, skip, no error
    expect(r.matchPct).toBeGreaterThanOrEqual(0);
    expect(r.matchPct).toBeLessThanOrEqual(100);
  });

  it('form picks do not propagate to every shared-parent strain (spread check)', () => {
    // If the pick bled fully into scoring at 1.0×, HK-similar batches would be 90%+.
    // At 0.3×, no batch should reach 90% from a single pick alone.
    const need = buildNeedVector({ form: ['Hindu Kush'] });
    const scores = allBatches.map(b => scoreSingle(need, b, noReports).matchPct);
    expect(Math.max(...scores)).toBeLessThan(90);  // no batch dominates at 90%+
  });
});
