/**
 * STEP 2.6 — Integration proof.
 *
 * A. D51 and Solo AKA → same genetics_id, same derived prior
 * B. New cross, no reports → derived prior with low confidence
 * C. Same strain + measured batch → measured wins, confidence rises
 * D. classifyName on 342 catalog names → counts by type
 */

import { describe, it, expect } from 'vitest';
import { resolveGenetics, derivePhenoPrior, classifyName } from '../genetics';
import { scoreSingle } from '../scorer';
import { buildNeedVector } from '../vectorMath';
import type { Batch } from '../types';

// ── A: D51 and Solo AKA → SAME genetics_id ───────────────────────────────────

describe('A: identity = genetics, not cultivator', () => {
  it('D51 and Solo AKA resolve to the same genetics_id', () => {
    const d51  = resolveGenetics('D51');
    const solo = resolveGenetics('Solo AKA');
    expect(d51).not.toBeNull();
    expect(solo).not.toBeNull();
    expect(d51!.id).toBe(solo!.id);
    expect(d51!.id).toBe('biscotti-gelato');
  });

  it('D51 and Solo AKA get the SAME derived prior (same vec, same conf)', () => {
    const d51Node  = resolveGenetics('D51')!;
    const soloNode = resolveGenetics('Solo AKA')!;
    // Both are the same node → same derivation
    const priorD51  = derivePhenoPrior(d51Node.id);
    const priorSolo = derivePhenoPrior(soloNode.id);

    expect(priorD51.conf).toBe(priorSolo.conf);
    expect(priorD51.vec.mood).toBe(priorSolo.vec.mood);
    expect(priorD51.vec.antiAnxiety).toBe(priorSolo.vec.antiAnxiety);

    console.log('\nA. D51 / Solo AKA prior:');
    console.log(`   id: ${d51Node.id}  conf: ${priorD51.conf.toFixed(3)}`);
    console.log(`   mood=${priorD51.vec.mood.toFixed(2)}  antiAnxiety=${priorD51.vec.antiAnxiety.toFixed(2)}`);
    console.log(`   bodyCalm=${priorD51.vec.bodyCalm.toFixed(2)}  antiPain=${priorD51.vec.antiPain.toFixed(2)}`);
    console.log(`   conf ≤ 0.5: ${priorD51.conf <= 0.5}`);
  });
});

// ── B: New cross, no community reports → derived prior + low confidence ───────

describe('B: new cross derivation', () => {
  it('OG Kush × Durban (= GSC approx) → derived prior, conf decayed from parents', () => {
    // This cross is NOT in the map as a named node, so resolveGenetics creates ephemeral
    const node = resolveGenetics('OG Kush × Durban');
    expect(node).not.toBeNull();
    const prior = derivePhenoPrior(node!.id);
    expect(prior.source).toBe('derived');
    expect(prior.conf).toBeLessThanOrEqual(0.5); // always capped

    // OG Kush leans antiAnxiety/antiPain, Durban leans clearHead/mood
    // → blend should have mix of both
    expect(prior.vec.mood).toBeGreaterThan(0.3);
    expect(prior.vec.antiAnxiety).toBeGreaterThan(0.3);

    console.log('\nB. OG Kush × Durban (ephemeral) prior:');
    console.log(`   source=${prior.source}  conf=${prior.conf.toFixed(3)}`);
    console.log(`   mood=${prior.vec.mood.toFixed(2)}  clearHead=${prior.vec.clearHead.toFixed(2)}  antiAnxiety=${prior.vec.antiAnxiety.toFixed(2)}`);
  });
});

// ── C: Measured batch overrides derived prior ─────────────────────────────────

describe('C: measured batch wins over prior', () => {
  it('biscotti-gelato derived conf < measured batch confidence', () => {
    const node = resolveGenetics('D51')!;
    const prior = derivePhenoPrior(node.id);

    // Simulate a batch with measured terpenes (COA data)
    const measuredBatch: Batch = {
      id: 'b-d51-measured', productId: 'p-d51',
      thcPct: 22, cbdPct: 3,
      terpenes: [
        { terpene: 'limonene',      pct: 0.65 },
        { terpene: 'caryophyllene', pct: 0.30 },
        { terpene: 'linalool',      pct: 0.20 },
      ],
      provenance: 'measured', category: 'T22/C3',
    };

    const need   = buildNeedVector({ reasons: ['anxiety'] });
    const result = scoreSingle(need, measuredBatch, { n: 0, mean: 0 });

    console.log('\nC. D51 — derived prior vs measured batch:');
    console.log(`   derived conf: ${prior.conf.toFixed(3)}  (max 0.5)`);
    console.log(`   measured scored confidence: ${result.confidence.toFixed(3)}  (has measured layer)`);
    console.log(`   topLayer: ${result.topLayer}`);

    // Measured batch confidence = (0.35 + 0.30 × 1) × evidenceFactor
    // limonene=human → evidenceFactor ≥ 0.87 → confidence ≥ 0.565 > 0.5
    expect(result.confidence).toBeGreaterThan(prior.conf);
    expect(result.topLayer).toBe('measured');
  });
});

// ── D: classifyName on all 342 catalog names ──────────────────────────────────

describe('D: classifyName survey on 342 catalog strains', () => {
  it('classifies all strain names and reports counts', async () => {
    // Dynamic import so test doesn't fail if strainsConfig has issues
    const { STRAINS } = await import('../../data/strainsConfig.js' as string);

    const counts = { likely_hybrid: 0, likely_landrace: 0, coded: 0, unknown: 0 };
    const examplesByType: Record<string, string[]> = {
      likely_hybrid: [], likely_landrace: [], coded: [], unknown: [],
    };

    for (const strain of STRAINS) {
      // Run on lineage (cross patterns) and name (codes) separately
      const lineageResult = classifyName(strain.lineage ?? '');
      const nameResult    = classifyName(strain.name    ?? '');

      // Classify as the more-specific result
      const bestType = lineageResult.type !== 'unknown'
        ? lineageResult.type
        : nameResult.type;

      counts[bestType]++;
      if (examplesByType[bestType].length < 3) {
        examplesByType[bestType].push(strain.name || strain.en || '');
      }
    }

    console.log('\nD. classifyName on 342 catalog strains:');
    console.log(`   likely_hybrid:   ${counts.likely_hybrid}  examples: ${examplesByType.likely_hybrid.join(', ')}`);
    console.log(`   likely_landrace: ${counts.likely_landrace}  examples: ${examplesByType.likely_landrace.join(', ')}`);
    console.log(`   coded:           ${counts.coded}  examples: ${examplesByType.coded.join(', ')}`);
    console.log(`   unknown:         ${counts.unknown}  (Hebrew commercial names + unlabeled)`);
    console.log(`   total:           ${Object.values(counts).reduce((a, b) => a + b, 0)}`);

    // Sanity: all strains are classified
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(STRAINS.length);

    // At least some hybrid crosses should be found (we saw 34 × patterns in lineage)
    expect(counts.likely_hybrid).toBeGreaterThanOrEqual(20);

    // The vast majority of Israeli market names are Hebrew → unknown
    expect(counts.unknown).toBeGreaterThan(counts.likely_hybrid);
  });
});
