/**
 * legacyBridge.ts — adapts the existing strainsConfig data format to the
 * engine's Batch + UserNeed types so scoreSingle can be called without any
 * backend changes.
 *
 * Call path:
 *   strainToBatch(strain)  →  Batch
 *   ansToNeed(ans)         →  UserNeed
 *   bridgeScore(...)       →  ScoredProduct  (drop-in replacement for old `match` int)
 */
import type { Batch, TerpeneReading, Terpene, ReportAggregate } from './types.ts';
import { buildNeedVector } from './vectorMath.ts';
import { scoreSingle }     from './scorer.ts';

/** Parse "T22/C4" → {thcPct:22, cbdPct:4}.  Returns thcPct=18, cbdPct=3 on failure. */
function parseCat(cat: string): { thcPct: number; cbdPct: number } {
  const m = cat.match(/T(\d+)\/C(\d+)/i);
  return m ? { thcPct: parseInt(m[1]), cbdPct: parseInt(m[2]) } : { thcPct: 18, cbdPct: 3 };
}

/** Known terpene keys in the static data that map to engine Terpene type. */
const VALID_TERPENES = new Set<string>([
  'myrcene','limonene','linalool','caryophyllene','pinene','terpinolene','humulene','ocimene',
]);

/**
 * Convert a legacy strain object (from strainsConfig.js) to a Batch.
 *   strain.terps  = { myrcene: 0.8, linalool: 0.6, ... }  (0-1 scale)
 *   strain.cat    = "T22/C4"
 */
export function strainToBatch(strain: {
  id:       string;
  cat:      string;
  terps?:   Record<string, number>;
  [k: string]: unknown;
}): Batch {
  const { thcPct, cbdPct } = parseCat(strain.cat);
  const terpenes: TerpeneReading[] = Object.entries(strain.terps ?? {})
    .filter(([t]) => VALID_TERPENES.has(t))
    .map(([terpene, pct]) => ({ terpene: terpene as Terpene, pct }));

  return {
    id:          strain.id,
    productId:   strain.id,
    thcPct,
    cbdPct,
    terpenes,
    provenance:  terpenes.length > 0 ? 'declared' : 'inferred',
    category:    strain.cat,
  };
}

/**
 * Convert legacy `ans` onboarding answers to a UserNeed.
 * Handles both the old ans shape and the new shape transparently.
 */
export function ansToNeed(ans: {
  reasons?:       string[];
  cats?:          string[];
  killSwitches?:  string[];
  gramsByCategory?: Record<string, number>;
  timing?:        string[];
  terpWeights?:   Record<string, number>;
  // Layer 3: experience drives the new-user route; likedStrainNames feed the B3 single-pick nudge;
  // dislikedStrainNames feed the bounded dislike demotion.
  experience?:           'first' | 'little' | 'experienced';
  likedStrainNames?:     string[];
  dislikedStrainNames?:  string[];
  [k: string]: unknown;
}) {
  return buildNeedVector({
    reasons:         ans.reasons ?? [],
    cats:            ans.cats ?? [],
    killSwitches:    (ans.killSwitches ?? []) as Terpene[],
    gramsByCategory: ans.gramsByCategory,
    timing:          ans.timing ?? [],
    experience:      ans.experience,
    form:            ans.likedStrainNames ?? [],
    disliked:        ans.dislikedStrainNames ?? [],
  });
}

/**
 * bridgeScore — compute a single strain's engine score.
 *
 * reports — optional community data from the API (falls back to { n:0, mean:0 }).
 * Returns a matchPct in 0-100 (replaces the old 40-98 `match` field),
 * plus confidence, reasonHuman, topLayer, and a kill-switch flag.
 */
export function bridgeScore(
  strain: Parameters<typeof strainToBatch>[0],
  ans: Parameters<typeof ansToNeed>[0],
  reports?: ReportAggregate,
) {
  const batch  = strainToBatch(strain);
  const need   = ansToNeed(ans);
  const reps   = reports ?? { n: 0, mean: 0 };
  return scoreSingle(need, batch, reps);
}
