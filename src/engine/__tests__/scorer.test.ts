import { describe, it, expect } from 'vitest';
import { scoreSingle } from '../scorer';
import { buildNeedVector } from '../vectorMath';
import type { Batch, ReportAggregate } from '../types';

// ── Fixtures ──────────────────────────────────────────────────────────────────
const sleepBatch: Batch = {
  id: 'b-sleep', productId: 'p-sleep',
  thcPct: 22, cbdPct: 4,
  terpenes: [
    { terpene: 'myrcene',  pct: 0.8 },
    { terpene: 'linalool', pct: 0.4 },
  ],
  provenance: 'declared', category: 'T22/C4',
};

const noTerpBatch: Batch = {
  id: 'b-noterp', productId: 'p-noterp',
  thcPct: 18, cbdPct: 3,
  terpenes: [],
  provenance: 'inferred', category: 'T18/C3',
};

const clearBatch: Batch = {
  id: 'b-clear', productId: 'p-clear',
  thcPct: 15, cbdPct: 3,
  terpenes: [
    { terpene: 'pinene',    pct: 0.6 },
    { terpene: 'limonene',  pct: 0.5 },
  ],
  provenance: 'declared', category: 'T15/C3',
};

const noReports: ReportAggregate = { n: 0, mean: 0 };

// ── §8 scoreSingle tests ──────────────────────────────────────────────────────
describe('scoreSingle', () => {
  it('zero-report strain → sane matchPct + confidence from prior×evidenceFactor (§7)', () => {
    // noTerpBatch = thcDominant prior; markers average evidenceFactor ≈ 0.667
    // confidence = 0.35 × 0.667 ≈ 0.233 (prior-only, no community)
    const need = buildNeedVector({ reasons: ['sleep'] }); // no license gate
    const result = scoreSingle(need, noTerpBatch, noReports);
    expect(result.matchPct).toBeGreaterThanOrEqual(0);
    expect(result.matchPct).toBeLessThanOrEqual(100);
    expect(result.confidence).toBeCloseTo(0.233, 2);
    expect(result.topLayer).toBe('prior');
  });

  it('evidence shift: adding reports → confidence rises (§7)', () => {
    const need = buildNeedVector({ reasons: ['sleep'] });
    const lowReports: ReportAggregate  = { n: 5,  mean: 0.75 };
    const manyReports: ReportAggregate = { n: 50, mean: 0.75 };

    const r0  = scoreSingle(need, noTerpBatch, noReports);
    const r5  = scoreSingle(need, noTerpBatch, lowReports);
    const r50 = scoreSingle(need, noTerpBatch, manyReports);

    // Base confidence now comes from evidenceFactor (≈0.233 for thcDominant prior).
    // Community component adds on top and is NOT evidence-modulated.
    expect(r0.confidence).toBeCloseTo(0.233, 2);
    expect(r5.confidence).toBeGreaterThan(r0.confidence);
    expect(r50.confidence).toBeGreaterThan(r5.confidence);
  });

  it('evidence shift: score moves toward high community mean as n grows', () => {
    const need = buildNeedVector({ reasons: ['sleep'] }); // no license gate
    const manyReports: ReportAggregate = { n: 100, mean: 0.90 };
    const r100 = scoreSingle(need, noTerpBatch, manyReports);
    expect(r100.matchPct).toBeGreaterThan(70); // pulled toward high community mean
  });

  it('batch override: adding terpenes changes score vs prior-only (§7)', () => {
    const need = buildNeedVector({ reasons: ['sleep'], cats: ['T22/C4'] });
    const prior   = scoreSingle(need, noTerpBatch, noReports);
    const measured = scoreSingle(need, sleepBatch,  noReports);
    // Sleep batch with myrcene+linalool should score differently than prior
    expect(measured.matchPct).not.toBe(prior.matchPct);
  });

  it('sleep batch scores higher than clear-head batch for sleep need', () => {
    const need   = buildNeedVector({ reasons: ['sleep'], cats: ['T22/C4', 'T15/C3'] });
    const rSleep = scoreSingle(need, sleepBatch, noReports);
    const rClear = scoreSingle(need, clearBatch,  noReports);
    expect(rSleep.matchPct).toBeGreaterThan(rClear.matchPct);
  });

  it('kill-switch terpene dominant → matchPct 0 (§7)', () => {
    const need = buildNeedVector({ reasons: ['sleep'], cats: ['T22/C4'], killSwitches: ['myrcene'] });
    const result = scoreSingle(need, sleepBatch, noReports);
    expect(result.matchPct).toBe(0);
  });

  it('license category mismatch → matchPct 0 (§4.4)', () => {
    const need = buildNeedVector({ reasons: ['sleep'], cats: ['T1/C22'] }); // CBD license only
    const result = scoreSingle(need, sleepBatch, noReports); // sleepBatch = T22/C4
    expect(result.matchPct).toBe(0);
  });

  it('empty licenseCategories → not filtered (no gate)', () => {
    const need = buildNeedVector({ reasons: ['sleep'] }); // no cats
    const result = scoreSingle(need, sleepBatch, noReports);
    expect(result.matchPct).toBeGreaterThan(0);
  });

  it('measured layer dominates over prior when terpenes present', () => {
    const need   = buildNeedVector({ reasons: ['sleep'], cats: ['T22/C4'] });
    const result = scoreSingle(need, sleepBatch, noReports);
    expect(result.topLayer).toBe('measured');
  });

  it('community layer dominates when n is very large', () => {
    const need   = buildNeedVector({ reasons: ['sleep'], cats: ['T22/C4'] });
    const many: ReportAggregate = { n: 200, mean: 0.9 };
    const result = scoreSingle(need, sleepBatch, many);
    expect(result.topLayer).toBe('community');
  });

  it('reasonHuman never contains terpene chemical names', () => {
    const need = buildNeedVector({ reasons: ['sleep'], cats: ['T22/C4'] });
    const result = scoreSingle(need, sleepBatch, noReports);
    const chemNames = ['myrcene', 'linalool', 'limonene', 'caryophyllene', 'pinene', 'terpinolene', 'humulene', 'ocimene'];
    chemNames.forEach(name => expect(result.reasonHuman.toLowerCase()).not.toContain(name));
  });

  it('matchPct and confidence always in valid ranges', () => {
    const need = buildNeedVector({ reasons: ['pain', 'anxiety'], cats: ['T22/C4', 'T15/C3'] });
    [sleepBatch, noTerpBatch, clearBatch].forEach(b => {
      const r = scoreSingle(need, b, { n: 12, mean: 0.6 });
      expect(r.matchPct).toBeGreaterThanOrEqual(0);
      expect(r.matchPct).toBeLessThanOrEqual(100);
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
    });
  });
});
