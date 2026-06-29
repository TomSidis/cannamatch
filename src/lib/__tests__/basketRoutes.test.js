/**
 * basketRoutes.test.js — Layer 6: two basket routes (יקר / זול).
 *   - 20g + day&night: each basket covers both day-parts within budget
 *   - יקר prefers box, זול prefers bag for the SAME underlying fit ranking
 *   - neither basket contains a low-fit strain chosen purely on price
 *   - diversity guard prevents near-duplicates in one basket
 *   - no gram data → both baskets still built from the fitting set
 *   - price never adjacent to a match % (separate fields)
 */
import { describe, it, expect } from 'vitest';
import { buildBasketRoutes } from '../basketRoutes.js';
import { buildNeedVector } from '../../engine/vectorMath.ts';
import { scoreAll } from '../../engine/scorer.ts';

const mkBatch = (id, thc, cbd, terps = []) => ({
  id, productId: `p-${id}`, thcPct: thc, cbdPct: cbd,
  terpenes: terps.map(([terpene, pct]) => ({ terpene, pct })),
  provenance: terps.length ? 'declared' : 'inferred', category: `T${thc}/C${cbd}`,
});

const noReports = { n: 0, mean: 0 };
const sleepB = mkBatch('sleep', 22, 4, [['myrcene', 0.8], ['linalool', 0.4]]);
const dayB   = mkBatch('day',   15, 3, [['pinene', 0.6], ['limonene', 0.5]]);
const painB  = mkBatch('pain',  20, 4, [['caryophyllene', 0.7]]);
const scoredOf = (need, batches) => scoreAll(need, batches.map((b) => ({ batch: b, reports: noReports })));

describe('20g + day&night → both baskets cover both day-parts within budget', () => {
  const need = buildNeedVector({
    reasons: ['sleep', 'focus'], timing: ['morning', 'night'],
    gramsByCategory: { 'T22/C4': 10, 'T15/C3': 10 },
  });
  const batches = [sleepB, dayB, painB];
  const routes = buildBasketRoutes(need, scoredOf(need, batches), batches);

  it('both routes produce bags', () => {
    expect(routes.expensive.bags.length).toBeGreaterThan(0);
    expect(routes.cheap.bags.length).toBe(routes.expensive.bags.length); // same selection
  });
  it('coverage spans morning + night', () => {
    expect(routes.coverage.times).toEqual(expect.arrayContaining(['morning', 'night']));
  });
});

describe('יקר prefers box, זול prefers bag — same underlying fit ranking', () => {
  const need = buildNeedVector({ reasons: ['sleep'], gramsByCategory: { 'T22/C4': 20 } });
  const batches = [sleepB];
  const offersByStrain = {
    sleep: [
      { packaging: 'box', price: 320, format: 'inflorescence' },
      { packaging: 'bag', price: 180, format: 'inflorescence' },
    ],
  };
  const routes = buildBasketRoutes(need, scoredOf(need, batches), batches, { offersByStrain });

  it('expensive route picks the box', () => {
    expect(routes.expensive.bags[0].presentation.packaging).toBe('box');
    expect(routes.expensive.bags[0].presentation.price).toBe(320);
  });
  it('cheap route picks the bag', () => {
    expect(routes.cheap.bags[0].presentation.packaging).toBe('bag');
    expect(routes.cheap.bags[0].presentation.price).toBe(180);
  });
  it('both routes hold the SAME strain (identical fit selection)', () => {
    expect(routes.cheap.bags.map((b) => b.batchId)).toEqual(routes.expensive.bags.map((b) => b.batchId));
  });
  it('cheap route still shows a strain that only has a box (best available, no price-drop)', () => {
    const r2 = buildBasketRoutes(need, scoredOf(need, batches), batches, {
      offersByStrain: { sleep: [{ packaging: 'box', price: 320 }] },
    });
    expect(r2.cheap.bags[0].batchId).toBe('sleep');
    expect(r2.cheap.bags[0].presentation.packaging).toBe('box');
  });
});

describe('fit leads — no low-fit strain chosen on price', () => {
  it('a cheap low-fit strain not picked by the planner is in neither basket', () => {
    const need = buildNeedVector({ reasons: ['sleep'], gramsByCategory: { 'T22/C4': 20 } });
    const lowFit = mkBatch('cheaplowfit', 18, 3, [['terpinolene', 0.9]]); // poor sleep fit
    const batches = [sleepB, lowFit];
    const offersByStrain = {
      sleep:        [{ packaging: 'box', price: 300 }],
      cheaplowfit:  [{ packaging: 'bag', price: 90 }], // cheapest, but a bad match
    };
    const scored = scoreAll(need, batches.map((b) => ({ batch: b, reports: noReports })));
    const routes = buildBasketRoutes(need, scored, batches, { offersByStrain, maxBags: 1 });
    const ids = routes.cheap.bags.map((b) => b.batchId);
    expect(ids).toContain('sleep');
    expect(ids).not.toContain('cheaplowfit');
  });
});

describe('diversity guard — no near-duplicates in one basket', () => {
  it('does not include the same strain twice', () => {
    const need = buildNeedVector({ reasons: ['sleep'], gramsByCategory: { 'T22/C4': 30 } });
    const dup = { ...sleepB };
    const batches = [sleepB, dup];
    const scored = [
      ...scoreAll(need, [{ batch: sleepB, reports: noReports }]),
      { ...scoreAll(need, [{ batch: sleepB, reports: noReports }])[0], batchId: 'sleep', productId: 'p-sleep2' },
    ];
    const routes = buildBasketRoutes(need, scored, batches, { maxBags: 5 });
    const ids = routes.expensive.bags.map((b) => b.batchId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('no gram data → both baskets still built', () => {
  it('produces bags + the unknown-grams warning', () => {
    const need = buildNeedVector({ reasons: ['sleep'] }); // no gramsByCategory
    const batches = [sleepB, dayB];
    const routes = buildBasketRoutes(need, scoredOf(need, batches), batches);
    expect(routes.expensive.bags.length).toBeGreaterThan(0);
    expect(routes.cheap.bags.length).toBeGreaterThan(0);
    expect(routes.warnings.some((w) => w.includes('גרמים'))).toBe(true);
  });
});

describe('price never adjacent to a match %', () => {
  it('bag carries matchPct at top level and price only nested in presentation', () => {
    const need = buildNeedVector({ reasons: ['sleep'], gramsByCategory: { 'T22/C4': 20 } });
    const routes = buildBasketRoutes(need, scoredOf(need, [sleepB]), [sleepB], {
      offersByStrain: { sleep: [{ packaging: 'box', price: 320 }] },
    });
    const bag = routes.expensive.bags[0];
    expect(typeof bag.matchPct).toBe('number');
    expect('price' in bag).toBe(false);          // no price beside the fit
    expect(bag.presentation.price).toBe(320);    // price lives in economics only
  });
});
