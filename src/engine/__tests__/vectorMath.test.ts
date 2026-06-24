import { describe, it, expect } from 'vitest';
import { cosine, buildNeedVector, buildProductVector, zeroVec } from '../vectorMath';
import type { EffectVector, Batch } from '../types';

// ── §8 cosine tests ───────────────────────────────────────────────────────────
describe('cosine', () => {
  it('identical vectors → 1', () => {
    const v: EffectVector = { bodyCalm:.5, clearHead:.3, sleep:.8, antiPain:.2, mood:.4, antiAnxiety:.6, appetite:.1 };
    expect(cosine(v, v)).toBeCloseTo(1, 5);
  });

  it('orthogonal vectors → 0', () => {
    const a: EffectVector = { bodyCalm:1, clearHead:0, sleep:0, antiPain:0, mood:0, antiAnxiety:0, appetite:0 };
    const b: EffectVector = { bodyCalm:0, clearHead:1, sleep:0, antiPain:0, mood:0, antiAnxiety:0, appetite:0 };
    expect(cosine(a, b)).toBeCloseTo(0, 5);
  });

  it('zero-norm vector a → 0, never NaN (§7)', () => {
    const zero = zeroVec();
    const v: EffectVector = { bodyCalm:.5, clearHead:.3, sleep:.8, antiPain:.2, mood:.4, antiAnxiety:.6, appetite:.1 };
    expect(cosine(zero, v)).toBe(0);
    expect(cosine(v, zero)).toBe(0);
    expect(cosine(zero, zero)).toBe(0);
  });

  it('scaled parallel vector → same similarity', () => {
    const a: EffectVector = { bodyCalm:.5, clearHead:.3, sleep:.8, antiPain:.2, mood:.4, antiAnxiety:.6, appetite:.1 };
    const b: EffectVector = { bodyCalm:1, clearHead:.6, sleep:1.6, antiPain:.4, mood:.8, antiAnxiety:1.2, appetite:.2 };
    expect(cosine(a, b)).toBeCloseTo(1, 5);
  });
});

// ── §8 buildNeedVector tests ──────────────────────────────────────────────────
describe('buildNeedVector', () => {
  it('PTSD → high antiAnxiety + sleep (different from epilepsy)', () => {
    const ptsd = buildNeedVector({ reasons: ['ptsd'] });
    const epilepsy = buildNeedVector({ reasons: ['epilepsy'] });

    expect(ptsd.effect.antiAnxiety).toBeGreaterThan(0.5);
    expect(ptsd.effect.sleep).toBeGreaterThan(0.3);

    // PTSD ≠ epilepsy vector
    expect(cosine(ptsd.effect, epilepsy.effect)).toBeLessThan(0.99);
  });

  it('sleep condition → times include evening/night', () => {
    const need = buildNeedVector({ reasons: ['sleep'] });
    expect(need.times).toContain('evening');
    expect(need.times).toContain('night');
  });

  it('focus condition → clearHead dominant', () => {
    const need = buildNeedVector({ reasons: ['focus'] });
    expect(need.effect.clearHead).toBeGreaterThan(need.effect.sleep);
    expect(need.effect.clearHead).toBeGreaterThan(need.effect.bodyCalm);
  });

  it('licenseCategories from cats', () => {
    const need = buildNeedVector({ reasons: ['pain'], cats: ['T22/C4', 'T15/C3'] });
    expect(need.licenseCategories).toContain('T22/C4');
  });

  it('empty reasons → valid zero-ish vector (fail soft)', () => {
    const need = buildNeedVector({});
    const values = Object.values(need.effect) as number[];
    expect(values.every(v => v >= 0 && v <= 1)).toBe(true);
  });
});

// ── buildProductVector tests ──────────────────────────────────────────────────
describe('buildProductVector', () => {
  const sleepBatch: Batch = {
    id: 'b1', productId: 'p1', thcPct: 22, cbdPct: 4,
    terpenes: [
      { terpene: 'myrcene', pct: 0.8 },
      { terpene: 'linalool', pct: 0.4 },
    ],
    provenance: 'declared', category: 'T22/C4',
  };

  it('with terpenes → provenance matches batch', () => {
    const { provenance } = buildProductVector(sleepBatch);
    expect(provenance).toBe('declared');
  });

  it('with terpenes → sleep/bodyCalm dominant (myrcene+linalool)', () => {
    const { vec } = buildProductVector(sleepBatch);
    expect(vec.sleep + vec.bodyCalm).toBeGreaterThan(vec.clearHead + vec.mood);
  });

  it('empty terpenes → provenance is inferred (§7)', () => {
    const emptyBatch: Batch = { ...sleepBatch, terpenes: [] };
    const { provenance } = buildProductVector(emptyBatch);
    expect(provenance).toBe('inferred');
  });

  it('all values in [0,1]', () => {
    const { vec } = buildProductVector(sleepBatch);
    Object.values(vec).forEach(v => expect(v).toBeGreaterThanOrEqual(0));
    Object.values(vec).forEach(v => expect(v).toBeLessThanOrEqual(1));
  });
});
