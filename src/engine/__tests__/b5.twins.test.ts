/**
 * B5 — Twin substitution.
 *
 * Twin priority: same_genetics > similar_terpenes > near_chemotype.
 *
 * Iron rules verified here:
 *   1. OOS favorite → nearest available twin returned
 *   2. same_genetics twin ranked above near-chemotype twin
 *   3. TwinCandidate NEVER contains a price field
 *   4. All 4 available candidates produce valid 0-100 matchPct (no crash)
 *   5. OOS batch with no twins → empty array
 */

import { describe, it, expect } from 'vitest';
import { findTwinSubstitutes } from '../twins';
import { buildNeedVector } from '../vectorMath';
import type { Batch, UserNeed } from '../types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const sleepNeed: UserNeed = buildNeedVector({ reasons: ['sleep'] });

// OOS target: T20/C4, myrcene-heavy sleep strain, genetics g-sleep
const oosBatch: Batch = {
  id: 'oos-favorite', productId: 'p-oos', commercialName: 'אגדה 20/4',
  thcPct: 20, cbdPct: 4,
  terpenes: [{ terpene: 'myrcene', pct: 1.8 }, { terpene: 'linalool', pct: 0.6 }],
  provenance: 'declared', category: 'T20/C4',
  geneticsId: 'g-sleep',
  inStock: false,
};

// Exact twin: same genetics_id, different marketer, in stock
const exactTwin: Batch = {
  id: 'twin-exact', productId: 'p-twin-exact', commercialName: 'לנדה 20/4',
  thcPct: 20, cbdPct: 4,
  terpenes: [{ terpene: 'myrcene', pct: 1.5 }, { terpene: 'linalool', pct: 0.8 }],
  provenance: 'declared', category: 'T20/C4',
  geneticsId: 'g-sleep',  // ← same genetics as OOS
  inStock: true,
};

// Similar terpenes: same chemotype (T20/C4 → thcDominant), overlapping myrcene
const similarTerpsBatch: Batch = {
  id: 'twin-terps', productId: 'p-twin-terps', commercialName: 'דולצ׳ה 18/4',
  thcPct: 18, cbdPct: 4,
  terpenes: [{ terpene: 'myrcene', pct: 1.2 }, { terpene: 'caryophyllene', pct: 0.7 }],
  provenance: 'declared', category: 'T18/C4',
  geneticsId: 'g-other-1',  // different genetics
  inStock: true,
};

// Near chemotype: same chemotype, no terpene overlap
const nearChemoBatch: Batch = {
  id: 'twin-chemo', productId: 'p-twin-chemo', commercialName: 'רוקט 22/6',
  thcPct: 22, cbdPct: 6,
  terpenes: [{ terpene: 'pinene', pct: 1.0 }, { terpene: 'terpinolene', pct: 0.8 }],
  provenance: 'declared', category: 'T22/C6',
  geneticsId: 'g-other-2',
  inStock: true,
};

// Different chemotype (CBD-dominant): should never appear in results
const wrongChemoBatch: Batch = {
  id: 'wrong-chemo', productId: 'p-wrong', commercialName: 'CBD 2/20',
  thcPct: 2, cbdPct: 20,
  terpenes: [{ terpene: 'myrcene', pct: 1.5 }],
  provenance: 'declared', category: 'T2/C20',
  geneticsId: 'g-cbd',
  inStock: true,
};

// Another OOS batch: should be skipped
const alsoOosBatch: Batch = {
  id: 'also-oos', productId: 'p-also-oos', commercialName: 'מדינת ישראל 20/4',
  thcPct: 20, cbdPct: 4,
  terpenes: [{ terpene: 'myrcene', pct: 2.0 }],
  provenance: 'declared', category: 'T20/C4',
  geneticsId: 'g-sleep',
  inStock: false,
};

const allCandidates: Batch[] = [
  exactTwin, similarTerpsBatch, nearChemoBatch, wrongChemoBatch, alsoOosBatch,
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('B5 — findTwinSubstitutes: OOS → nearest available twin', () => {
  it('returns at least one result when valid twins exist', () => {
    const results = findTwinSubstitutes(oosBatch, allCandidates, sleepNeed);
    expect(results.length).toBeGreaterThan(0);
  });

  it('exact twin (same_genetics) ranked #1 over near-chemotype twin', () => {
    const results = findTwinSubstitutes(oosBatch, allCandidates, sleepNeed);
    expect(results[0].batchId).toBe('twin-exact');
    expect(results[0].twinReason).toBe('same_genetics');
  });

  it('similar_terpenes twin ranked above near_chemotype twin', () => {
    const results = findTwinSubstitutes(oosBatch, allCandidates, sleepNeed);
    const terpsIdx = results.findIndex(r => r.batchId === 'twin-terps');
    const chemoIdx = results.findIndex(r => r.batchId === 'twin-chemo');
    expect(terpsIdx).toBeLessThan(chemoIdx);
  });

  it('wrong-chemotype batch excluded from results', () => {
    const results = findTwinSubstitutes(oosBatch, allCandidates, sleepNeed);
    expect(results.some(r => r.batchId === 'wrong-chemo')).toBe(false);
  });

  it('OOS candidates excluded (inStock=false skipped)', () => {
    const results = findTwinSubstitutes(oosBatch, allCandidates, sleepNeed);
    expect(results.some(r => r.batchId === 'also-oos')).toBe(false);
    expect(results.some(r => r.batchId === 'oos-favorite')).toBe(false);
  });

  it('twinReason values are one of the expected enum values', () => {
    const valid = new Set(['same_genetics', 'similar_terpenes', 'near_chemotype']);
    const results = findTwinSubstitutes(oosBatch, allCandidates, sleepNeed);
    for (const r of results) {
      expect(valid.has(r.twinReason)).toBe(true);
    }
  });

  it('matchPct is in [0, 100] for all candidates', () => {
    const results = findTwinSubstitutes(oosBatch, allCandidates, sleepNeed);
    for (const r of results) {
      expect(r.matchPct).toBeGreaterThanOrEqual(0);
      expect(r.matchPct).toBeLessThanOrEqual(100);
    }
  });
});

describe('B5 — no price in TwinCandidate', () => {
  it('TwinCandidate has no price field (iron rule: price never next to match%)', () => {
    const results = findTwinSubstitutes(oosBatch, allCandidates, sleepNeed);
    for (const r of results) {
      expect('price' in r).toBe(false);
      expect('pricePerGram' in r).toBe(false);
      expect('cost' in r).toBe(false);
    }
  });

  it('result contains commercialName, matchPct, twinReason, reasonHuman — nothing more financial', () => {
    const results = findTwinSubstitutes(oosBatch, allCandidates, sleepNeed);
    expect(results.length).toBeGreaterThan(0);
    const r = results[0];
    expect(typeof r.commercialName).toBe('string');
    expect(typeof r.matchPct).toBe('number');
    expect(typeof r.twinReason).toBe('string');
    expect(typeof r.reasonHuman).toBe('string');
  });
});

describe('B5 — edge cases', () => {
  it('no candidates → empty array', () => {
    expect(findTwinSubstitutes(oosBatch, [], sleepNeed)).toEqual([]);
  });

  it('all candidates OOS → empty array', () => {
    const allOos = allCandidates.map(b => ({ ...b, inStock: false as const }));
    expect(findTwinSubstitutes(oosBatch, allOos, sleepNeed)).toEqual([]);
  });

  it('no genetics match + no chemotype match → empty array', () => {
    // CBD-dominant only pool — oosBatch is thcDominant → no twins
    const cbdPool: Batch[] = [{ ...wrongChemoBatch, id: 'cbd-only', inStock: true }];
    expect(findTwinSubstitutes(oosBatch, cbdPool, sleepNeed)).toEqual([]);
  });

  it('only same_genetics twins → all have twinReason same_genetics', () => {
    const sameGeneticsCandidates: Batch[] = [
      { ...exactTwin, id: 'twin-sg-2', productId: 'p-sg-2', geneticsId: 'g-sleep' },
    ];
    const results = findTwinSubstitutes(oosBatch, sameGeneticsCandidates, sleepNeed);
    expect(results.every(r => r.twinReason === 'same_genetics')).toBe(true);
  });

  it('batch without geneticsId still matched by chemotype (graceful fallback)', () => {
    const noGeneticsId: Batch = {
      ...similarTerpsBatch, id: 'no-gid', geneticsId: undefined,
    };
    const results = findTwinSubstitutes(oosBatch, [noGeneticsId], sleepNeed);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].twinReason).toBe('similar_terpenes');
  });
});
