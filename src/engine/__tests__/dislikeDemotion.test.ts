/**
 * dislikeDemotion.test.ts — Layer 3: the disliked onboarding pick demotes chemically
 * similar strains, mirroring the liked-strain boost. Bounded, never a hard exclude.
 *
 *   - a strain similar to the disliked pick is demoted; a dissimilar one barely moves
 *   - demotion is bounded — a high-fit strain is NOT pushed below a low-fit one by dislike
 *   - a demoted strain still appears in results (never removed)
 *   - no disliked pick → scores identical to before (no regression for first-timers / legacy)
 */
import { describe, it, expect } from 'vitest';
import { scoreSingle, scoreAll } from '../scorer';
import { buildNeedVector } from '../vectorMath';
import type { Batch } from '../types';

const reports = { n: 0, mean: 0 };
const pct = (need: ReturnType<typeof buildNeedVector>, b: Batch) => scoreSingle(need, b, reports).matchPct;

// Disliked = Hindu Kush (myrcene-heavy indica). Need: sleep.
const needNo       = buildNeedVector({ reasons: ['sleep'] });
const needDislike  = buildNeedVector({ reasons: ['sleep'], disliked: ['Hindu Kush'] });

// similar to a myrcene-heavy indica; dissimilar = pinene/limonene clear-head profile.
const similarBatch: Batch = {
  id: 'sim', productId: 'p-sim', thcPct: 20, cbdPct: 4,
  terpenes: [{ terpene: 'myrcene', pct: 2.0 }],
  provenance: 'declared', category: 'T20/C4',
};
const dissimilarBatch: Batch = {
  id: 'dis', productId: 'p-dis', thcPct: 16, cbdPct: 3,
  terpenes: [{ terpene: 'pinene', pct: 1.5 }, { terpene: 'limonene', pct: 1.0 }],
  provenance: 'declared', category: 'T16/C3',
};

describe('dislike profile is derived from the pick', () => {
  it('a resolvable disliked name yields a non-null dislikedProfile', () => {
    expect(needDislike.dislikedProfile).toBeTruthy();
  });
  it('no disliked pick → dislikedProfile is null', () => {
    expect(needNo.dislikedProfile ?? null).toBeNull();
    expect(buildNeedVector({ reasons: ['sleep'], disliked: [] }).dislikedProfile ?? null).toBeNull();
  });
});

describe('similar strains demoted, dissimilar barely moved', () => {
  it('a strain similar to the disliked pick is demoted', () => {
    expect(pct(needDislike, similarBatch)).toBeLessThan(pct(needNo, similarBatch));
  });
  it('the similar strain is demoted more than the dissimilar one', () => {
    const demoteSimilar    = pct(needNo, similarBatch)    - pct(needDislike, similarBatch);
    const demoteDissimilar = pct(needNo, dissimilarBatch) - pct(needDislike, dissimilarBatch);
    expect(demoteSimilar).toBeGreaterThan(demoteDissimilar);
  });
});

describe('demotion is bounded — fit still leads', () => {
  // high sleep-fit (myrcene) but similar-to-disliked vs low sleep-fit (pinene) dissimilar.
  it('high-fit similar strain is NOT pushed below a low-fit dissimilar strain', () => {
    expect(pct(needNo, similarBatch) - pct(needNo, dissimilarBatch)).toBeGreaterThan(8); // clear base gap
    expect(pct(needDislike, similarBatch)).toBeGreaterThan(pct(needDislike, dissimilarBatch));
  });
});

describe('never a hard exclude', () => {
  it('a demoted strain still appears in scoreAll results', () => {
    const results = scoreAll(needDislike, [
      { batch: similarBatch, reports }, { batch: dissimilarBatch, reports },
    ]);
    expect(results.map(r => r.batchId)).toContain('sim');
    expect(results.find(r => r.batchId === 'sim')!.matchPct).toBeGreaterThanOrEqual(0);
  });
});

describe('no regression when there is no disliked pick', () => {
  it('scores are unchanged vs a need built without disliked', () => {
    for (const b of [similarBatch, dissimilarBatch]) {
      expect(pct(needNo, b)).toBe(pct(buildNeedVector({ reasons: ['sleep'] }), b));
    }
  });
});
