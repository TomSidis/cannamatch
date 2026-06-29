/**
 * newUserRoute.test.ts — Layer 3 engine: the new-user anxiolytic / lower-THC route.
 *
 * The route is a BOUNDED tie-breaker layered on indication fit. Tests:
 *   - gate: who gets the route (first/little always; veteran only with anxiety indication)
 *   - first-timer: linalool/limonene-leaning + lower-THC boosted, terpinolene demoted
 *   - myrcene counts only for night/all-day, never a day-only patient
 *   - veteran without an anxiety indication gets no boost
 *   - the layer never floats a low-fit strain above a high-fit one (fit leads)
 *   - the nudge is bounded (cannot swing a score wildly)
 */
import { describe, it, expect } from 'vitest';
import { scoreSingle } from '../scorer';
import { buildNeedVector } from '../vectorMath';
import type { Batch } from '../types';

const reports = { n: 0, mean: 0 };

// route ON: first-timer. route OFF (same effect vector): veteran with a non-anxiety indication.
const needOn  = (reasons: string[], timing?: string[]) => buildNeedVector({ reasons, timing, experience: 'first' });
const needOff = (reasons: string[], timing?: string[]) => buildNeedVector({ reasons, timing, experience: 'experienced' });

const score = (need: ReturnType<typeof buildNeedVector>, b: Batch) => scoreSingle(need, b, reports).matchPct;

// ── Fixtures ──────────────────────────────────────────────────────────────────
const anxioLowThc: Batch = {  // linalool+limonene dominant, CBD-dominant chemotype
  id: 'anxio', productId: 'p-anxio', thcPct: 3, cbdPct: 12,
  terpenes: [{ terpene: 'linalool', pct: 1.5 }, { terpene: 'limonene', pct: 1.0 }],
  provenance: 'declared', category: 'T3/C12',
};
const terpHighThc: Batch = {  // terpinolene dominant, THC dominant
  id: 'terp', productId: 'p-terp', thcPct: 22, cbdPct: 4,
  terpenes: [{ terpene: 'terpinolene', pct: 2.0 }],
  provenance: 'declared', category: 'T22/C4',
};
const myrceneBatch: Batch = {  // myrcene dominant, THC dominant
  id: 'myr', productId: 'p-myr', thcPct: 18, cbdPct: 3,
  terpenes: [{ terpene: 'myrcene', pct: 2.0 }],
  provenance: 'declared', category: 'T18/C3',
};

// ── Gate: who gets the route ────────────────────────────────────────────────────
describe('new-user route gate (buildNeedVector)', () => {
  it('first-timer → route ON', () => {
    expect(buildNeedVector({ reasons: ['pain'], experience: 'first' }).newUserRoute).toBe(true);
  });
  it('"a little" → route ON', () => {
    expect(buildNeedVector({ reasons: ['pain'], experience: 'little' }).newUserRoute).toBe(true);
  });
  it('veteran without anxiety indication → route OFF', () => {
    expect(buildNeedVector({ reasons: ['pain'], experience: 'experienced' }).newUserRoute).toBe(false);
  });
  it('veteran WITH anxiety indication → route ON', () => {
    expect(buildNeedVector({ reasons: ['anxiety'], experience: 'experienced' }).newUserRoute).toBe(true);
  });
  it('unknown experience → route OFF (does not silently re-route returning users)', () => {
    expect(buildNeedVector({ reasons: ['pain'] }).newUserRoute).toBe(false);
  });
});

// ── First-timer route behavior ──────────────────────────────────────────────────
describe('first-timer route: anxiolytic + lower-THC boosted, terpinolene demoted', () => {
  it('linalool/limonene + low-THC batch is boosted by the route', () => {
    expect(score(needOn(['pain']), anxioLowThc)).toBeGreaterThan(score(needOff(['pain']), anxioLowThc));
  });
  it('terpinolene + high-THC batch is demoted by the route', () => {
    expect(score(needOn(['pain']), terpHighThc)).toBeLessThan(score(needOff(['pain']), terpHighThc));
  });
  it('the route widens the anxiolytic-vs-terpinolene gap for a first-timer', () => {
    const gapOff = score(needOff(['pain']), anxioLowThc) - score(needOff(['pain']), terpHighThc);
    const gapOn  = score(needOn(['pain']),  anxioLowThc) - score(needOn(['pain']),  terpHighThc);
    expect(gapOn).toBeGreaterThan(gapOff);
  });
});

// ── Myrcene: night / all-day only ────────────────────────────────────────────────
describe('myrcene counts only for night / all-day, never day-only', () => {
  it('myrcene route boost at night exceeds the boost during a day-only window', () => {
    const deltaDay   = score(needOn(['sleep'], ['morning']), myrceneBatch) - score(needOff(['sleep'], ['morning']), myrceneBatch);
    const deltaNight = score(needOn(['sleep'], ['night']),   myrceneBatch) - score(needOff(['sleep'], ['night']),   myrceneBatch);
    expect(deltaNight).toBeGreaterThan(deltaDay);
  });
});

// ── Indication fit leads — route never reorders a clear fit gap ───────────────────
describe('the route never floats a low-fit strain above a high-fit one', () => {
  // pain need: caryophyllene = strong antiPain fit. limonene-only low-THC = weak pain fit
  // (no antiPain) but earns the MAX route boost. Fit gap must survive the bounded nudge.
  const painFit: Batch = {
    id: 'painfit', productId: 'p-painfit', thcPct: 22, cbdPct: 4,
    terpenes: [{ terpene: 'caryophyllene', pct: 2.0 }],
    provenance: 'declared', category: 'T22/C4',
  };
  const anxioWeakPainFit: Batch = {
    id: 'weak', productId: 'p-weak', thcPct: 3, cbdPct: 15,
    terpenes: [{ terpene: 'limonene', pct: 2.0 }],
    provenance: 'declared', category: 'T3/C15',
  };
  it('there is a clear base pain-fit gap, wider than the realized route nudge', () => {
    const off = needOff(['pain']);
    expect(score(off, painFit) - score(off, anxioWeakPainFit)).toBeGreaterThan(8);
  });
  it('high pain-fit batch still outranks the anxiolytic low-fit batch with route ON', () => {
    const need = needOn(['pain']);
    expect(score(need, painFit)).toBeGreaterThan(score(need, anxioWeakPainFit));
  });
});

// ── Bounded nudge ────────────────────────────────────────────────────────────────
describe('route nudge is bounded (cannot dominate the raw signal)', () => {
  it('|route ON − route OFF| ≤ 6 pts for any batch', () => {
    for (const b of [anxioLowThc, terpHighThc, myrceneBatch]) {
      const d = Math.abs(score(needOn(['pain']), b) - score(needOff(['pain']), b));
      expect(d).toBeLessThanOrEqual(6);
    }
  });
});
