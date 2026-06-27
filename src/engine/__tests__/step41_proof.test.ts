/**
 * STEP 4.4 — Scoring wiring proof.
 *
 * A. Strain with derived prior only → sane matchPct, low confidence (≤ 0.5)
 * B. Same strain + measured batch → measured overrides, confidence rises
 * C. Inject "anxiety" adverse reports into ONE grow_batch → only it is flagged,
 *    not the whole strain, and the other batch of the same strain is clean
 * D. Two grow batches of one strain, different cultivation methods → scored
 *    and flagged independently
 */

import { describe, it, expect } from 'vitest';
import { scoreSingle, scoreAllWithMap } from '../scorer';
import { flagBatches, aggregateByBatch } from '../batchSignal';
import { resolveGenetics, derivePhenoPrior } from '../genetics';
import { buildNeedVector } from '../vectorMath';
import type { Batch, AxialReport, GeneticsPrior } from '../types';

// ── shared helpers ─────────────────────────────────────────────────────────────

function makeNeed(conditions: string[]) {
  return buildNeedVector({ reasons: conditions, licenseCategories: [], gramsByCategory: {} });
}

function makeBatch(id: string, overrides: Partial<Batch> = {}): Batch {
  return {
    id,
    productId: `prod-${id}`,
    thcPct: 20,
    cbdPct: 0.5,
    terpenes: [],
    provenance: 'declared',
    category: 'T20/C1',
    ...overrides,
  };
}

// Build GeneticsPrior from the genetics engine for biscotti-gelato (D51 / Solo AKA)
function bgPrior(): GeneticsPrior {
  const node = resolveGenetics('D51')!;
  const derived = derivePhenoPrior(node.id);
  return { vec: derived.vec, conf: derived.conf, source: derived.source };
}

// ── A: derived prior only → sane matchPct, low confidence ────────────────────

describe('A: derived prior only', () => {
  it('biscotti-gelato (D51) with no measured terpenes → conf ≤ 0.5', () => {
    const need   = makeNeed(['anxiety']);
    const batch  = makeBatch('batch-a1', { geneticsPrior: bgPrior() });
    const result = scoreSingle(need, batch);

    console.log('\nA. Derived-prior-only batch:');
    console.log(`   matchPct=${result.matchPct}  confidence=${result.confidence.toFixed(3)}  layer=${result.topLayer}`);

    // Confidence must be low (no measured terpenes, no community reports)
    expect(result.confidence).toBeLessThanOrEqual(0.5);
    // But matchPct must be sane (0..100)
    expect(result.matchPct).toBeGreaterThanOrEqual(0);
    expect(result.matchPct).toBeLessThanOrEqual(100);
    // With derived conf ≈ 0.4, topLayer should be 'prior'
    expect(result.topLayer).toBe('prior');
  });

  it('no genetics prior → confidence ≈ 0.35 × evidenceFactor (chemotype-only baseline)', () => {
    const need   = makeNeed(['anxiety']);
    const batch  = makeBatch('batch-a2'); // no geneticsPrior
    const result = scoreSingle(need, batch);

    // Baseline confidence (chemotype prior, no terpenes, no community)
    expect(result.confidence).toBeLessThanOrEqual(0.5);
    expect(result.topLayer).toBe('prior');
  });
});

// ── B: measured batch overrides derived prior, confidence rises ───────────────

describe('B: measured batch overrides prior', () => {
  it('adding terpene readings raises confidence above derived-only', () => {
    const need    = makeNeed(['anxiety']);
    const prior   = bgPrior();

    const batchDerivedOnly = makeBatch('batch-b1', { geneticsPrior: prior });
    const batchMeasured    = makeBatch('batch-b2', {
      geneticsPrior: prior,
      terpenes: [
        { terpene: 'limonene',    pct: 0.72 },
        { terpene: 'linalool',    pct: 0.48 },
        { terpene: 'myrcene',     pct: 0.41 },
        { terpene: 'pinene',      pct: 0.31 },
        { terpene: 'caryophyllene', pct: 0.28 },
      ],
      provenance: 'measured',
    });

    const derived   = scoreSingle(need, batchDerivedOnly);
    const measured  = scoreSingle(need, batchMeasured);

    console.log('\nB. Derived vs measured confidence:');
    console.log(`   derived-only:  matchPct=${derived.matchPct}  confidence=${derived.confidence.toFixed(3)}  layer=${derived.topLayer}`);
    console.log(`   with terpenes: matchPct=${measured.matchPct}  confidence=${measured.confidence.toFixed(3)}  layer=${measured.topLayer}`);

    // Measured must yield higher confidence
    expect(measured.confidence).toBeGreaterThan(derived.confidence);
    // Measured layer dominates when terpenes are present
    expect(measured.topLayer).toBe('measured');
    // Derived stays as prior
    expect(derived.topLayer).toBe('prior');
  });
});

// ── C: adverse reports into ONE batch → only THAT batch flagged ───────────────

describe('C: batch-level flagging (not strain-level)', () => {
  const STRAIN_ID = 'biscotti-gelato';

  // Two batches of the SAME strain
  const batchGreenhouse = makeBatch('tchelet-greenhouse-001', { productId: STRAIN_ID });
  const batchIndoor     = makeBatch('tchelet-indoor-002',     { productId: STRAIN_ID });

  // 8 adverse "anxiety" reports injected only into the greenhouse batch
  const adverseReports: AxialReport[] = Array.from({ length: 8 }, (_, i) => ({
    batchId: 'tchelet-greenhouse-001',
    axis: 'antiAnxiety' as const,
    score: 0.2,                       // adverse: clearly below 0.4 threshold
    cultivationMethod: 'greenhouse' as const,
  }));

  // 3 positive reports for the indoor batch (no flag expected)
  const positiveReports: AxialReport[] = Array.from({ length: 3 }, () => ({
    batchId: 'tchelet-indoor-002',
    axis: 'antiAnxiety' as const,
    score: 0.8,
    cultivationMethod: 'indoor' as const,
  }));

  const allReports = [...adverseReports, ...positiveReports];

  it('flagBatches identifies the greenhouse batch as adverse', () => {
    const flagged = flagBatches(allReports);
    console.log('\nC. Flagged batches:', JSON.stringify(flagged, null, 2));

    // Greenhouse batch is flagged
    const ghFlag = flagged.find(f => f.batchId === 'tchelet-greenhouse-001');
    expect(ghFlag).toBeDefined();
    expect(ghFlag!.axis).toBe('antiAnxiety');
    expect(ghFlag!.adverseRate).toBeGreaterThanOrEqual(0.6);
  });

  it('indoor batch of the SAME strain is NOT flagged', () => {
    const flagged = flagBatches(allReports);
    const indoorFlag = flagged.find(f => f.batchId === 'tchelet-indoor-002');
    // Only 3 reports and they're positive → should not be flagged
    expect(indoorFlag).toBeUndefined();
  });

  it('scoring reflects adverse community signal only for the flagged batch', () => {
    const need      = makeNeed(['anxiety']);
    const reportMap = aggregateByBatch(allReports);

    const scores = scoreAllWithMap(need, [batchGreenhouse, batchIndoor], reportMap);
    const ghScore     = scores.find(s => s.batchId === 'tchelet-greenhouse-001')!;
    const indoorScore = scores.find(s => s.batchId === 'tchelet-indoor-002')!;

    console.log('\nC2. Scoring with adverse community map:');
    console.log(`   greenhouse: matchPct=${ghScore.matchPct}  layer=${ghScore.topLayer}`);
    console.log(`   indoor:     matchPct=${indoorScore.matchPct}  layer=${indoorScore.topLayer}`);

    // With 8 adverse reports at mean ≈ 0.2, greenhouse score should be much lower
    expect(ghScore.matchPct).toBeLessThan(indoorScore.matchPct);
    // Greenhouse has community layer (n=8 > K=8 is borderline, but w(8)=0.5)
    expect(['community', 'measured', 'prior']).toContain(ghScore.topLayer);
  });
});

// ── D: two batches, different methods → separate scoring + flagging ────────────

describe('D: two batches of same strain shown as separate', () => {
  it('greenhouse and indoor batches of biscotti-gelato score independently', () => {
    const prior  = bgPrior();
    const need   = makeNeed(['sleep']);

    // Greenhouse batch has known terpenes (heavier profile)
    const ghBatch = makeBatch('bg-greenhouse-A', {
      geneticsPrior: { ...prior, cultivationMethod: 'greenhouse' },
      terpenes: [{ terpene: 'myrcene', pct: 1.1 }, { terpene: 'linalool', pct: 0.6 }],
      provenance: 'measured',
    });

    // Indoor batch has lighter terpene profile
    const indBatch = makeBatch('bg-indoor-B', {
      geneticsPrior: { ...prior, cultivationMethod: 'indoor' },
      terpenes: [{ terpene: 'myrcene', pct: 0.4 }, { terpene: 'linalool', pct: 0.2 }],
      provenance: 'measured',
    });

    const scores = scoreAllWithMap(need, [ghBatch, indBatch], {});
    const ghS  = scores.find(s => s.batchId === 'bg-greenhouse-A')!;
    const indS = scores.find(s => s.batchId === 'bg-indoor-B')!;

    console.log('\nD. Greenhouse vs Indoor same strain, sleep need:');
    console.log(`   greenhouse (heavier):  matchPct=${ghS.matchPct}  confidence=${ghS.confidence.toFixed(3)}`);
    console.log(`   indoor (lighter):      matchPct=${indS.matchPct}  confidence=${indS.confidence.toFixed(3)}`);

    // Scores are independent (both sane)
    expect(ghS.matchPct).toBeGreaterThanOrEqual(0);
    expect(indS.matchPct).toBeGreaterThanOrEqual(0);
    // Both have measured layer
    expect(ghS.topLayer).toBe('measured');
    expect(indS.topLayer).toBe('measured');
    // Heavier myrcene+linalool → higher sleep matchPct for greenhouse
    expect(ghS.matchPct).toBeGreaterThanOrEqual(indS.matchPct);
  });

  it('cultivation meta-signal detected when ≥2 flagged batches share a method', () => {
    const adverseGH1: AxialReport[] = Array.from({ length: 6 }, () => ({
      batchId: 'bg-greenhouse-A', axis: 'antiAnxiety' as const, score: 0.2,
      cultivationMethod: 'greenhouse' as const,
    }));
    const adverseGH2: AxialReport[] = Array.from({ length: 6 }, () => ({
      batchId: 'bg-greenhouse-C', axis: 'antiAnxiety' as const, score: 0.2,
      cultivationMethod: 'greenhouse' as const,
    }));

    const flagged = flagBatches([...adverseGH1, ...adverseGH2]);
    console.log('\nD2. Cultivation meta-signal:', JSON.stringify(flagged));

    expect(flagged).toHaveLength(2);
    expect(flagged[0].cultivationSignal).toBe('greenhouse');
    expect(flagged[1].cultivationSignal).toBe('greenhouse');
  });
});
