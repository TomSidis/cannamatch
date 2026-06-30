/**
 * dayPartWeight.test.ts — Layer 5 refinement: day-part WEIGHTS dominant terpenes
 * (rank-based, no %, no indica/sativa) by the patient's stated time of need.
 *
 *   - night up-weights myrcene/linalool; day up-weights limonene/caryophyllene + down-weights myrcene
 *   - both → balanced (no amplification)
 *   - rank-based only — identical terpenes in different chemovars get the SAME nudge
 *   - bounded — indication fit still leads
 */
import { describe, it, expect } from 'vitest';
import { applyDayPartWeight, scoreSingle } from '../scorer';
import { buildNeedVector } from '../vectorMath';
import type { Batch, TimeOfDay } from '../types';

const NIGHT: TimeOfDay[] = ['night'];
const DAY:   TimeOfDay[] = ['morning', 'noon', 'afternoon'];
const BOTH:  TimeOfDay[] = ['morning', 'noon', 'afternoon', 'evening', 'night'];

const mk = (terps: [string, number][], cat = 'T20/C4'): Batch => ({
  id: 't', productId: 'p', thcPct: 20, cbdPct: 4,
  terpenes: terps.map(([terpene, pct]) => ({ terpene: terpene as any, pct })),
  provenance: 'declared', category: cat,
});

const myrcene  = mk([['myrcene', 2.0]]);
const linalool = mk([['linalool', 2.0]]);
const limonene = mk([['limonene', 2.0]]);
const pinene   = mk([['pinene', 2.0]]);

describe('applyDayPartWeight — direction by time of need', () => {
  it('night up-weights myrcene', () => {
    expect(applyDayPartWeight(NIGHT, myrcene, 0.5)).toBeGreaterThan(0.5);
  });
  it('night up-weights linalool', () => {
    expect(applyDayPartWeight(NIGHT, linalool, 0.5)).toBeGreaterThan(0.5);
  });
  it('day up-weights limonene', () => {
    expect(applyDayPartWeight(DAY, limonene, 0.5)).toBeGreaterThan(0.5);
  });
  it('day DOWN-weights myrcene (sedating is wrong for daytime)', () => {
    expect(applyDayPartWeight(DAY, myrcene, 0.5)).toBeLessThan(0.5);
  });
  it('both → balanced, no amplification (base unchanged)', () => {
    expect(applyDayPartWeight(BOTH, myrcene, 0.5)).toBe(0.5);
    expect(applyDayPartWeight(BOTH, limonene, 0.5)).toBe(0.5);
  });
  it('a non-target terpene (pinene) is untouched at night', () => {
    expect(applyDayPartWeight(NIGHT, pinene, 0.5)).toBe(0.5);
  });
});

describe('rank-based only — no indica/sativa / chemovar logic in the weighting', () => {
  it('same terpenes, different chemovar → identical day-part nudge', () => {
    const myrTHC = mk([['myrcene', 2.0]], 'T22/C4');  // THC-dominant
    const myrCBD = mk([['myrcene', 2.0]], 'T1/C20');  // CBD-dominant
    expect(applyDayPartWeight(NIGHT, myrTHC, 0.5)).toBe(applyDayPartWeight(NIGHT, myrCBD, 0.5));
  });
});

// ── Integration through scoreSingle ──────────────────────────────────────────
const reports = { n: 0, mean: 0 };
const pct = (need: ReturnType<typeof buildNeedVector>, b: Batch) => scoreSingle(need, b, reports).matchPct;

describe('integration — ranking shifts with day-part', () => {
  it('night user: myrcene-dominant strain ranks above a non-myrcene/linalool strain', () => {
    const need = buildNeedVector({ reasons: ['sleep'], timing: ['night'] });
    expect(pct(need, myrcene)).toBeGreaterThan(pct(need, pinene));
  });
  it('day user: limonene strain scores higher by day than by night; myrcene scores lower by day', () => {
    const day   = buildNeedVector({ reasons: ['mood'], timing: DAY });
    const night = buildNeedVector({ reasons: ['mood'], timing: NIGHT });
    expect(pct(day, limonene)).toBeGreaterThan(pct(night, limonene));
    expect(pct(day, myrcene)).toBeLessThan(pct(night, myrcene));
  });
  it('indication fit still leads — day-part does not push a low-fit strain above a high-fit one', () => {
    const day = buildNeedVector({ reasons: ['pain'], timing: DAY });
    const painFit = mk([['caryophyllene', 2.0]], 'T22/C4'); // strong pain fit
    const lowFit  = mk([['limonene', 2.0]], 'T22/C4');      // weak pain fit, but day up-weights limonene
    expect(pct(day, painFit)).toBeGreaterThan(pct(day, lowFit));
  });
});
