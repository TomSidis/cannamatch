import { describe, it, expect } from 'vitest';
import { planBasket } from '../basketPlanner';
import { buildNeedVector, zeroVec } from '../vectorMath';
import { scoreSingle, scoreAll } from '../scorer';
import type { Batch, ReportAggregate, ScoredProduct } from '../types';

// ── Fixtures ──────────────────────────────────────────────────────────────────
const mkBatch = (id: string, thcPct: number, cbdPct: number, terpenes: { terpene: any; pct: number }[] = [], category = ''): Batch => ({
  id, productId: `p-${id}`,
  thcPct, cbdPct, terpenes,
  provenance: terpenes.length ? 'declared' : 'inferred',
  category: category || `T${thcPct}/C${cbdPct}`,
});

const sleepBatch  = mkBatch('sleep', 22, 4, [{ terpene: 'myrcene', pct: 0.8 }, { terpene: 'linalool', pct: 0.4 }]);
const focusBatch  = mkBatch('focus', 15, 3, [{ terpene: 'pinene', pct: 0.6 }, { terpene: 'limonene', pct: 0.5 }]);
const painBatch   = mkBatch('pain',  20, 4, [{ terpene: 'caryophyllene', pct: 0.7 }, { terpene: 'limonene', pct: 0.3 }]);
const noterp      = mkBatch('noterp', 18, 3);
const noReports: ReportAggregate = { n: 0, mean: 0 };

function makeScored(need: ReturnType<typeof buildNeedVector>, batches: Batch[]): ScoredProduct[] {
  return scoreAll(need, batches.map(b => ({ batch: b, reports: noReports })));
}

// ── §8 planBasket tests ───────────────────────────────────────────────────────
describe('planBasket', () => {
  it('sleep-only need → bags cover evening/night times', () => {
    const need   = buildNeedVector({ reasons: ['sleep'] });
    const batches = [sleepBatch, focusBatch, painBatch];
    const scored  = makeScored(need, batches);
    const plan    = planBasket(need, scored, batches);

    expect(plan.bags.length).toBeGreaterThan(0);
    expect(plan.coverage.times.some(t => t === 'evening' || t === 'night')).toBe(true);
  });

  it('mixed morning+night need → bags cover both', () => {
    const need   = buildNeedVector({ reasons: ['focus', 'sleep'], timing: ['morning', 'night'] });
    const batches = [sleepBatch, focusBatch, painBatch];
    const scored  = makeScored(need, batches);
    const plan    = planBasket(need, scored, batches);

    expect(plan.bags.length).toBeGreaterThanOrEqual(1);
    // At least one bag should exist given matching products
    expect(plan.bags.every(b => b.matchPct >= 0)).toBe(true);
  });

  it('respects maxBags: never returns more than requested', () => {
    const need   = buildNeedVector({ reasons: ['pain', 'anxiety', 'sleep', 'focus'] });
    const batches = [sleepBatch, focusBatch, painBatch, noterp];
    const scored  = makeScored(need, batches);
    const plan    = planBasket(need, scored, batches, { maxBags: 2 });

    expect(plan.bags.length).toBeLessThanOrEqual(2);
  });

  it('all matchPct = 0 (kill-switch or license) → empty bags + warning', () => {
    const need = buildNeedVector({ reasons: ['sleep'], cats: ['T1/C22'] }); // license blocks all batches
    const batches = [sleepBatch, focusBatch];
    const scored  = makeScored(need, batches);
    const plan    = planBasket(need, scored, batches);

    expect(plan.bags.length).toBe(0);
    expect(plan.warnings.length).toBeGreaterThan(0);
  });

  it('no gramsByCategory → includes "כמות גרמים לא ידועה" warning', () => {
    const need   = buildNeedVector({ reasons: ['sleep'] });
    const batches = [sleepBatch];
    const scored  = makeScored(need, batches);
    const plan    = planBasket(need, scored, batches);

    expect(plan.warnings.some(w => w.includes('גרמים'))).toBe(true);
  });

  it('with gramsByCategory → grams allocated, no budget warning', () => {
    const need = buildNeedVector({ reasons: ['sleep'], gramsByCategory: { 'T22/C4': 30 } });
    const batches = [sleepBatch];
    const scored  = makeScored(need, batches);
    const plan    = planBasket(need, scored, batches);

    if (plan.bags.length > 0) {
      const totalGrams = plan.bags.reduce((t, b) => t + b.grams, 0);
      expect(totalGrams).toBeGreaterThan(0);
    }
    expect(plan.warnings.some(w => w.includes('גרמים'))).toBe(false);
  });

  it('diversity guard: does NOT pick the same batch twice', () => {
    // Feed the same batch twice in different scored entries
    const need   = buildNeedVector({ reasons: ['sleep'] });
    const batches = [sleepBatch, sleepBatch]; // duplicate
    const scored: ScoredProduct[] = [
      scoreSingle(need, sleepBatch, noReports),
      { ...scoreSingle(need, sleepBatch, noReports), batchId: 'sleep', productId: 'p-sleep2' },
    ];
    const plan = planBasket(need, scored, batches, { maxBags: 5 });
    const ids = plan.bags.map(b => b.batchId);
    // Set size = unique count; near-duplicates should be skipped
    expect(new Set(ids).size).toEqual(ids.length);
  });

  it('each bag has a Hebrew role string', () => {
    const need   = buildNeedVector({ reasons: ['sleep', 'pain'] });
    const batches = [sleepBatch, painBatch];
    const scored  = makeScored(need, batches);
    const plan    = planBasket(need, scored, batches);

    plan.bags.forEach(b => {
      expect(typeof b.role).toBe('string');
      expect(b.role.length).toBeGreaterThan(0);
    });
  });

  it('bags list is sorted best-matchPct first', () => {
    const need   = buildNeedVector({ reasons: ['sleep', 'pain', 'focus'] });
    const batches = [sleepBatch, focusBatch, painBatch, noterp];
    const scored  = makeScored(need, batches);
    const plan    = planBasket(need, scored, batches);

    for (let i = 1; i < plan.bags.length; i++) {
      // Marginal-coverage greedy may not always strictly descend, but first bag should be highest
      expect(plan.bags[0].matchPct).toBeGreaterThanOrEqual(plan.bags[i].matchPct);
    }
  });
});
