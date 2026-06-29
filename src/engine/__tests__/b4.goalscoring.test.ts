/**
 * B4 — Goal-specific scoring.
 *
 * Fixtures chosen to have clean axis separation after CONDITION_LEANS time-mods:
 *   sleepBatch   — myrcene only       (bodyCalm + sleep dominant)
 *   focusBatch   — pinene + terpinolene  (clearHead dominant, no antiAnxiety)
 *   anxietyBatch — limonene only      (antiAnxiety + mood + some clearHead)
 *   painBatch    — caryophyllene + humulene + myrcene  (antiPain dominant)
 *
 * Note: focusBatch deliberately avoids limonene so it cannot compete with
 * anxietyBatch on the antiAnxiety axis. This keeps anxiety/focus separation clean.
 *
 * Assertions:
 *   1. Same batch scores differently for different goals
 *   2. scoreAllForGoal ranks by the selected goal (not a generic blend)
 *   3. Day-vs-night (time-bucket goal) produces correct ranking
 */

import { describe, it, expect } from 'vitest';
import { scoreForGoal, scoreAllForGoal } from '../scorer';
import type { Batch } from '../types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const sleepBatch: Batch = {
  id: 'b4-sleep', productId: 'p4-sleep',
  thcPct: 20, cbdPct: 5,
  terpenes: [{ terpene: 'myrcene', pct: 2.0 }],  // bodyCalm+sleep dominant, no antiAnxiety
  provenance: 'declared', category: 'T20/C5',
};

const focusBatch: Batch = {
  id: 'b4-focus', productId: 'p4-focus',
  thcPct: 16, cbdPct: 2,
  terpenes: [
    { terpene: 'pinene',      pct: 1.5 },  // clearHead dominant
    { terpene: 'terpinolene', pct: 1.0 },  // clearHead + mood
  ],
  provenance: 'declared', category: 'T16/C2',
};

// limonene-only: antiAnxiety + mood; beats focusBatch for anxiety goal
// because anxiety need needs antiAnxiety which limonene provides (focusBatch lacks it).
const anxietyBatch: Batch = {
  id: 'b4-anxiety', productId: 'p4-anxiety',
  thcPct: 14, cbdPct: 6,
  terpenes: [{ terpene: 'limonene', pct: 2.0 }],
  provenance: 'declared', category: 'T14/C6',
};

const painBatch: Batch = {
  id: 'b4-pain', productId: 'p4-pain',
  thcPct: 22, cbdPct: 6,
  terpenes: [
    { terpene: 'caryophyllene', pct: 1.3 },  // antiPain dominant
    { terpene: 'humulene',      pct: 0.7 },
    { terpene: 'myrcene',       pct: 0.6 },
  ],
  provenance: 'declared', category: 'T22/C6',
};

const allBatches = [sleepBatch, focusBatch, anxietyBatch, painBatch];
const noMap = {};

// ── 1. Same batch scores differently across goals ────────────────────────────

describe('B4 — same batch scores differently for different goals', () => {
  it('sleep batch: sleep score > focus score', () => {
    expect(scoreForGoal('sleep', sleepBatch)).toBeGreaterThan(scoreForGoal('focus', sleepBatch));
  });

  it('focus batch: focus score > sleep score', () => {
    expect(scoreForGoal('focus', focusBatch)).toBeGreaterThan(scoreForGoal('sleep', focusBatch));
  });

  it('anxiety batch: anxiety score > pain score', () => {
    expect(scoreForGoal('anxiety', anxietyBatch)).toBeGreaterThan(scoreForGoal('pain', anxietyBatch));
  });

  it('pain batch: pain score > sleep score', () => {
    expect(scoreForGoal('pain', painBatch)).toBeGreaterThan(scoreForGoal('sleep', painBatch));
  });

  it('sleep batch scores differ by > 5 pts between sleep and focus goals', () => {
    const diff = Math.abs(scoreForGoal('sleep', sleepBatch) - scoreForGoal('focus', sleepBatch));
    expect(diff).toBeGreaterThan(5);
  });

  it('anxiety batch scores differ between anxiety and sleep goals', () => {
    expect(scoreForGoal('anxiety', anxietyBatch)).not.toBe(scoreForGoal('sleep', anxietyBatch));
  });
});

// ── 2. scoreAllForGoal ranks by the selected goal ────────────────────────────

describe('B4 — scoreAllForGoal ranking respects selected goal', () => {
  it('sleep goal: sleepBatch ranks #1', () => {
    const results = scoreAllForGoal('sleep', allBatches, noMap);
    expect(results[0].batchId).toBe('b4-sleep');
  });

  it('focus goal: focusBatch ranks #1', () => {
    const results = scoreAllForGoal('focus', allBatches, noMap);
    expect(results[0].batchId).toBe('b4-focus');
  });

  it('anxiety goal: anxietyBatch ranks #1', () => {
    const results = scoreAllForGoal('anxiety', allBatches, noMap);
    expect(results[0].batchId).toBe('b4-anxiety');
  });

  it('pain goal: painBatch ranks in top 2', () => {
    const results = scoreAllForGoal('pain', allBatches, noMap);
    const top2 = results.slice(0, 2).map(r => r.batchId);
    expect(top2).toContain('b4-pain');
  });

  it('sleep and focus goals produce different rank orderings', () => {
    const sleepRanks = scoreAllForGoal('sleep', allBatches, noMap).map(r => r.batchId);
    const focusRanks = scoreAllForGoal('focus', allBatches, noMap).map(r => r.batchId);
    expect(sleepRanks).not.toEqual(focusRanks);
  });

  it('sleep and anxiety goals produce different rank orderings', () => {
    const sleepRanks  = scoreAllForGoal('sleep',   allBatches, noMap).map(r => r.batchId);
    const anxietyRanks = scoreAllForGoal('anxiety', allBatches, noMap).map(r => r.batchId);
    expect(sleepRanks).not.toEqual(anxietyRanks);
  });

  it('results are sorted descending by matchPct', () => {
    for (const goal of ['sleep', 'focus', 'anxiety', 'pain']) {
      const results = scoreAllForGoal(goal, allBatches, noMap);
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].matchPct).toBeGreaterThanOrEqual(results[i + 1].matchPct);
      }
    }
  });
});

// ── 3. Day-vs-night time-bucket goals ────────────────────────────────────────

describe('B4 — day-vs-night time-bucket goals', () => {
  it('evening goal: sleepBatch outranks focusBatch (bodyCalm+sleep vs clearHead)', () => {
    const evening  = scoreAllForGoal('evening', allBatches, noMap);
    const sleepIdx = evening.findIndex(r => r.batchId === 'b4-sleep');
    const focusIdx = evening.findIndex(r => r.batchId === 'b4-focus');
    expect(sleepIdx).toBeLessThan(focusIdx);
  });

  it('morning goal: focusBatch outranks sleepBatch (clearHead vs bodyCalm)', () => {
    const morning  = scoreAllForGoal('morning', allBatches, noMap);
    const focusIdx = morning.findIndex(r => r.batchId === 'b4-focus');
    const sleepIdx = morning.findIndex(r => r.batchId === 'b4-sleep');
    expect(focusIdx).toBeLessThan(sleepIdx);
  });

  it('evening and morning produce different rank orderings', () => {
    const eve  = scoreAllForGoal('evening', allBatches, noMap).map(r => r.batchId);
    const morn = scoreAllForGoal('morning', allBatches, noMap).map(r => r.batchId);
    expect(eve).not.toEqual(morn);
  });

  it('scoreForGoal with time bucket returns valid 0-100 matchPct', () => {
    for (const time of ['morning', 'afternoon', 'evening', 'night']) {
      const s = scoreForGoal(time, sleepBatch);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
  });

  it('night goal: sleepBatch score > morning score (night optimised for sleep)', () => {
    const night   = scoreForGoal('night',   sleepBatch);
    const morning = scoreForGoal('morning', sleepBatch);
    expect(night).toBeGreaterThan(morning);
  });
});
