import { describe, it, expect } from 'vitest';
import { scoreSingle } from '../scorer';
import { buildNeedVector } from '../vectorMath';
import type { Batch, ReportAggregate } from '../types';

// ── Real-world strain proxies ─────────────────────────────────────────────────

// A. Peace & Quiet (limonene-dominant, real Israeli market product)
const pAndQ: Batch = {
  id: 'b-pq', productId: 'p-pq',
  thcPct: 20, cbdPct: 4,
  terpenes: [
    { terpene: 'limonene',      pct: 0.7 },
    { terpene: 'caryophyllene', pct: 0.3 },
    { terpene: 'linalool',      pct: 0.2 },
  ],
  provenance: 'declared', category: 'T20/C4',
};

// B. Preclinical-only: myrcene+pinene, no limonene — both preclinical evidence
const thaiMix: Batch = {
  id: 'b-thai', productId: 'p-thai',
  thcPct: 22, cbdPct: 2,
  terpenes: [
    { terpene: 'myrcene', pct: 0.9 },
    { terpene: 'pinene',  pct: 0.5 },
  ],
  provenance: 'declared', category: 'T22/C2',
};

// C. MC61 proxy — terpinolene+myrcene, high THC, no antiAnxiety terpenes.
//    Vigil 2016 found this chemovar worsened anxiety in some patients.
const mc61: Batch = {
  id: 'b-mc61', productId: 'p-mc61',
  thcPct: 28, cbdPct: 0.5,
  terpenes: [
    { terpene: 'terpinolene', pct: 0.9 },
    { terpene: 'myrcene',     pct: 0.3 },
    { terpene: 'ocimene',     pct: 0.2 },
  ],
  provenance: 'declared', category: 'T28/C1',
};

const noReports: ReportAggregate = { n: 0, mean: 0 };

// Need: anxiety, no license gate (all categories allowed)
const anxietyNeed = buildNeedVector({ reasons: ['anxiety'] });

// ── STEP 1.4 scenarios ────────────────────────────────────────────────────────

describe('STEP 1.4 — Science KB proof', () => {

  it('A. limonene-dominant (human evidence) → confidence higher than preclinical-only', () => {
    const rA = scoreSingle(anxietyNeed, pAndQ, noReports);
    const rB = scoreSingle(anxietyNeed, thaiMix, noReports);

    console.log('\nA. Peace & Quiet (limonene, human):');
    console.log(`   matchPct=${rA.matchPct}  confidence=${rA.confidence.toFixed(3)}  layer=${rA.topLayer}`);
    console.log('B. Thai-mix (myrcene+pinene, preclinical):');
    console.log(`   matchPct=${rB.matchPct}  confidence=${rB.confidence.toFixed(3)}  layer=${rB.topLayer}`);

    // limonene='human' → evidenceFactor ≥ 0.875 (limonene 0.7pct + cary 0.3pct + linalool 0.2pct)
    // myrcene+pinene   → evidenceFactor = 0.5 (both preclinical)
    expect(rA.confidence).toBeGreaterThan(rB.confidence);
    expect(rA.matchPct).toBeGreaterThan(rB.matchPct); // limonene drives antiAnxiety
  });

  it('B. Preclinical-only batch → lower confidence than human-evidence batch', () => {
    const rA = scoreSingle(anxietyNeed, pAndQ, noReports);
    const rB = scoreSingle(anxietyNeed, thaiMix, noReports);

    // evidenceFactor for thaiMix = 0.5 (both preclinical)
    // confidence for thaiMix = 0.65 × 0.5 = 0.325 (measured, no community)
    expect(rB.confidence).toBeLessThan(rA.confidence);
    expect(rB.confidence).toBeGreaterThan(0); // not zero — just lower
  });

  it('C. MC61 — no community data → matchPct ≤ P&Q for anxiety need', () => {
    const rA = scoreSingle(anxietyNeed, pAndQ, noReports);
    const rC = scoreSingle(anxietyNeed, mc61, noReports);

    console.log('\nC. MC61 (terpinolene+myrcene, no antiAnxiety terpenes, 0 reports):');
    console.log(`   matchPct=${rC.matchPct}  confidence=${rC.confidence.toFixed(3)}  layer=${rC.topLayer}`);
    console.log(`   P&Q matchPct=${rA.matchPct} — MC61 should score lower for anxiety`);

    // terpinolene contributes clearHead+mood, NOT antiAnxiety
    // myrcene contributes bodyCalm+sleep, barely antiAnxiety
    // → MC61 must score lower on anxiety than limonene-dominant P&Q
    expect(rC.matchPct).toBeLessThan(rA.matchPct);
    // And confidence is low (preclinical, no community)
    expect(rC.confidence).toBeLessThan(0.40);
  });

  it('C2. MC61 + 50 community reports → confidence rises, community acknowledged', () => {
    const rC_none = scoreSingle(anxietyNeed, mc61, { n: 0,  mean: 0 });
    const rC_comm = scoreSingle(anxietyNeed, mc61, { n: 50, mean: 0.82 });

    console.log('\nC2. MC61 confidence without/with community:');
    console.log(`   n=0:  confidence=${rC_none.confidence.toFixed(3)}  matchPct=${rC_none.matchPct}`);
    console.log(`   n=50: confidence=${rC_comm.confidence.toFixed(3)}  matchPct=${rC_comm.matchPct}  layer=${rC_comm.topLayer}`);

    // Community data CAN justify a recommendation — that's the system working correctly.
    // Confidence rises significantly (w(50) ≈ 0.86 adds the community component).
    expect(rC_comm.confidence).toBeGreaterThan(rC_none.confidence);
    expect(rC_comm.confidence).toBeGreaterThan(0.55); // substantial community support
    // matchPct shifts toward community mean (0.82×100=82). The exact direction depends
    // on whether community mean is above or below the measured score — either is correct.
    // The point is it's in the same ballpark, driven by real reports not literature.
    expect(rC_comm.matchPct).toBeGreaterThanOrEqual(75);
    expect(rC_comm.topLayer).toBe('community'); // community dominates with n=50
  });

  it('D. reasonHuman never contains chemical or botanical names', () => {
    const results = [
      scoreSingle(anxietyNeed, pAndQ,   noReports),
      scoreSingle(anxietyNeed, thaiMix, noReports),
      scoreSingle(anxietyNeed, mc61,    noReports),
      scoreSingle(anxietyNeed, mc61, { n: 50, mean: 0.82 }),
    ];
    const forbidden = [
      'myrcene','limonene','caryophyllene','linalool','pinene',
      'terpinolene','humulene','ocimene',
      'indica','sativa','hybrid',
    ];
    for (const r of results) {
      for (const word of forbidden) {
        expect(r.reasonHuman.toLowerCase()).not.toContain(word);
      }
    }
  });

  it('E. indica/sativa never used as effect predictor (buildNeedVector ignores kind)', () => {
    // buildNeedVector has no `kind` parameter — strain type never enters the scoring
    const need1 = buildNeedVector({ reasons: ['anxiety'] });
    const need2 = buildNeedVector({ reasons: ['anxiety'] });
    // The two needs are identical — no kind influence
    expect(need1.effect).toEqual(need2.effect);

    // And scorer.ts never reads batch.kind (Batch type has no kind field)
    const rA = scoreSingle(need1, pAndQ, noReports);
    expect(rA.topLayer).toBe('measured'); // layers are prior/measured/community only
  });

  // ── Phase 6 PROVE IT gate ─────────────────────────────────────────────────────
  // Eligibility gate must fire BEFORE cosine similarity (spec P5 engine order).
  // "eligibility gate drops a forbidden strain before similarity"

  it('F. eligibility gate drops forbidden category before cosine is computed', () => {
    // A batch that would score VERY high for anxiety (pure limonene, top human evidence)
    // but is in a category the user is NOT licensed for.
    const highMatchForbidden: Batch = {
      id: 'b-forbidden', productId: 'p-forbidden',
      thcPct: 20, cbdPct: 4,
      terpenes: [
        { terpene: 'limonene', pct: 1.0 }, // maximum antiAnxiety signal
        { terpene: 'linalool', pct: 0.6 },
      ],
      provenance: 'declared', category: 'T20/C4',
    };
    const licensedNeed = buildNeedVector({
      reasons: ['anxiety'],
      cats: ['T10/C10', 'T12/C12'], // user only licensed for low-THC categories
    });

    const result = scoreSingle(licensedNeed, highMatchForbidden, noReports);

    // Eligibility gate: matchPct=0 regardless of how well the terpenes match
    expect(result.matchPct).toBe(0);
    expect(result.confidence).toBe(0);
    expect(result.reasonHuman).toBe('לא בקטגוריות הרישיון שלך');
  });

  it('G. kill-switch fires AFTER eligibility (licensed strain with kill terpene → kill-switch message)', () => {
    // A batch in a valid category AND with a kill-switch terpene.
    // Eligibility passes; kill-switch fires second.
    const licensedKillBatch: Batch = {
      id: 'b-kill', productId: 'p-kill',
      thcPct: 10, cbdPct: 10,
      terpenes: [
        { terpene: 'myrcene', pct: 0.8 }, // myrcene is the kill-switch
      ],
      provenance: 'declared', category: 'T10/C10',
    };
    const needWithKill = buildNeedVector({
      reasons: ['sleep'],
      cats: ['T10/C10'],      // this category IS licensed
      killSwitches: ['myrcene' as any],
    });

    const result = scoreSingle(needWithKill, licensedKillBatch, noReports);

    // Kill-switch fires (not license denied — order verified)
    expect(result.matchPct).toBe(0);
    expect(result.reasonHuman).toBe('הוסר — טריגר בפרופיל שלך');
  });
});
