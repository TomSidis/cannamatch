import type { TerpeneEffect, TerpeneCluster, ConditionLean, EffectVector, Chemotype, Terpene } from '../engine/types';

// ── §3 Science KB — data only, freely tunable ────────────────────────────────
// Source: TERPENE_EFFECTS grounded in clinical/preclinical literature (2024).
// evidence field drives confidence + honest UI copy.

export const TERPENE_EFFECTS: TerpeneEffect[] = [
  // myrcene: calming/sedating prior; values dialled back from .8/.7 — preclinical animal data only
  { terpene: 'myrcene',       effects: { bodyCalm: .7, sleep: .6, antiPain: .4 },              evidence: 'preclinical' },
  // linalool: mixed corpus (animal + one small human pilot)
  { terpene: 'linalool',      effects: { antiAnxiety: .7, sleep: .6, bodyCalm: .5 },           evidence: 'mixed' },
  // limonene: antiAnxiety raised .6→.7; the only terpene with RCT double-blind human data
  { terpene: 'limonene',      effects: { mood: .8, antiAnxiety: .7, clearHead: .3 },           evidence: 'human' },
  // caryophyllene: bodyCalm added (.3) from consistent CB2-mediated "grounding" reports; antiAnxiety raised .3→.4
  { terpene: 'caryophyllene', effects: { antiPain: .8, antiAnxiety: .4, bodyCalm: .3 },        evidence: 'mixed' },
  // pinene: clearHead dialled back .8→.7; focus claim is preclinical + thin basis
  { terpene: 'pinene',        effects: { clearHead: .7, antiPain: .2 },                        evidence: 'preclinical' },
  { terpene: 'terpinolene',   effects: { clearHead: .5, mood: .4 },                            evidence: 'preclinical' },
  { terpene: 'humulene',      effects: { antiPain: .4, appetite: -.6 },                        evidence: 'preclinical' },
  { terpene: 'ocimene',       effects: { mood: .4, clearHead: .3 },                            evidence: 'preclinical' },
];

// Helper — build zero EffectVector
const Z = (): EffectVector => ({
  bodyCalm: 0, clearHead: 0, sleep: 0, antiPain: 0, mood: 0, antiAnxiety: 0, appetite: 0,
});

// §3 — Clusters: synergistic terpene groupings
export const CLUSTERS: TerpeneCluster[] = [
  {
    // caryophyllene (mixed) + limonene (human) → evidence averaged as 'mixed'
    // Entourage effect disputed in literature — lean is a nudge, not a multiplier
    id: 'antiAnxietyPain',
    members: ['caryophyllene', 'limonene'],
    lean: { ...Z(), antiPain: .7, antiAnxiety: .7, mood: .6, bodyCalm: .4, clearHead: .3 },
    evidence: 'mixed',
  },
  {
    // myrcene (preclinical) + pinene (preclinical); pinene anti-THC-fog claim: preclinical only
    id: 'calmClear',
    members: ['myrcene', 'pinene'],
    lean: { ...Z(), bodyCalm: .8, clearHead: .6, sleep: .5, antiPain: .3, antiAnxiety: .3 },
    evidence: 'preclinical',
  },
  {
    // terpinolene + myrcene: both preclinical, linalool+myrcene analogue
    id: 'balancedMood',
    members: ['terpinolene', 'myrcene'],
    lean: { ...Z(), bodyCalm: .5, clearHead: .5, sleep: .3, mood: .6, antiAnxiety: .3 },
    evidence: 'preclinical',
  },
];

// §3 — Condition leans: evidence-informed therapeutic profiles
export const CONDITION_LEANS: ConditionLean[] = [
  {
    condition: 'sleep',
    lean: { ...Z(), sleep: .9, bodyCalm: .8, antiAnxiety: .4, antiPain: .3, mood: .2, clearHead: .1 },
    route: 'thcRising',
  },
  {
    condition: 'anxiety',
    lean: { ...Z(), antiAnxiety: .9, mood: .6, bodyCalm: .5, clearHead: .4, sleep: .2, antiPain: .1 },
    route: 'balanced',
  },
  {
    condition: 'ptsd',
    lean: { ...Z(), antiAnxiety: .8, sleep: .5, bodyCalm: .6, mood: .5, clearHead: .3, antiPain: .2 },
    route: 'balanced',
  },
  {
    condition: 'pain',
    lean: { ...Z(), antiPain: .9, bodyCalm: .7, sleep: .4, antiAnxiety: .3, mood: .3, clearHead: .2 },
    route: 'thcRising',
  },
  {
    condition: 'focus',
    lean: { ...Z(), clearHead: .9, mood: .5, antiAnxiety: .3, bodyCalm: .1, antiPain: .1 },
    route: 'cbdRich',
  },
  {
    condition: 'appetite',
    lean: { ...Z(), appetite: .9, mood: .5, bodyCalm: .2, clearHead: .2, antiAnxiety: .1, antiPain: .1 },
    route: 'thcRising',
  },
  {
    condition: 'gi',
    lean: { ...Z(), antiPain: .7, bodyCalm: .5, antiAnxiety: .3, appetite: .4, mood: .2, clearHead: .1 },
    route: 'cbdRich',
  },
  {
    condition: 'mood',
    lean: { ...Z(), mood: .9, antiAnxiety: .5, bodyCalm: .3, clearHead: .3, sleep: .1, antiPain: .1 },
    route: 'balanced',
  },
  {
    condition: 'diabetes',
    lean: { ...Z(), antiPain: .8, bodyCalm: .4, antiAnxiety: .3, sleep: .3, mood: .2 },
    route: 'cbdRising',
  },
  {
    condition: 'epilepsy',
    lean: { ...Z(), clearHead: .6, antiAnxiety: .7, mood: .3, bodyCalm: .5 },
    route: 'cbdRich',
  },
];

// §3 — Chemotype markers: terpenes typically dominant in each chemotype
export const CHEMOTYPE_MARKERS: Record<Chemotype, Terpene[]> = {
  thcDominant: ['limonene', 'terpinolene', 'linalool', 'caryophyllene', 'humulene', 'ocimene'],
  cbdDominant: ['pinene', 'myrcene'],
  balanced:    ['linalool', 'myrcene', 'caryophyllene'],
};
