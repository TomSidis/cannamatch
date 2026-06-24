// ── vocabulary ────────────────────────────────────────────────────────────────
export type Terpene =
  | 'myrcene' | 'limonene' | 'linalool' | 'caryophyllene'
  | 'pinene' | 'terpinolene' | 'humulene' | 'ocimene';

export type EffectAxis =
  | 'bodyCalm' | 'clearHead' | 'sleep' | 'antiPain' | 'mood' | 'antiAnxiety' | 'appetite';

export type Chemotype = 'thcDominant' | 'balanced' | 'cbdDominant';
export type TimeOfDay = 'morning' | 'noon' | 'afternoon' | 'evening' | 'night';
export type Provenance = 'measured' | 'declared' | 'inferred';

// Fixed key order for cosine — must not change; serialized into pgvector col.
export const EFFECT_AXIS_KEYS: EffectAxis[] = [
  'bodyCalm', 'clearHead', 'sleep', 'antiPain', 'mood', 'antiAnxiety', 'appetite',
];

// A vector over EffectAxis, every axis 0..1.
export type EffectVector = Record<EffectAxis, number>;

// ── science KB (data, not logic) ─────────────────────────────────────────────
export interface TerpeneEffect {
  terpene: Terpene;
  effects: Partial<Record<EffectAxis, number>>;
  evidence: 'preclinical' | 'mixed' | 'human';
}
export interface TerpeneCluster {
  id: string;
  members: Terpene[];
  lean: EffectVector;
  // Evidence level for the synergistic claim — used by scorer to modulate confidence.
  // 'human': RCT or controlled human study (e.g. limonene anti-anxiety)
  // 'mixed': animal + small human pilot
  // 'preclinical': animal / in-vitro only
  evidence: 'preclinical' | 'mixed' | 'human';
}
export interface ConditionLean { condition: string; lean: EffectVector; route: 'thcRising' | 'cbdRising' | 'balanced' | 'cbdRich'; }

// ── products & batches ────────────────────────────────────────────────────────
export interface TerpeneReading { terpene: Terpene; pct: number; }
export interface Batch {
  id: string; productId: string;
  thcPct: number; cbdPct: number;
  terpenes: TerpeneReading[];
  provenance: Provenance;
  category: string;
  testedAt?: string;
}
export interface Product {
  id: string; displayName: string;
  canonicalGeneticsId: string;
  parents?: string[];
  defaultChemotype?: Chemotype;
}

// ── user ──────────────────────────────────────────────────────────────────────
export interface UserNeed {
  effect: EffectVector;
  times: TimeOfDay[];
  conditions: string[];
  killSwitches: Terpene[];
  licenseCategories: string[];
  gramsByCategory: Record<string, number>;
}

// ── community reports (pre-aggregated) ───────────────────────────────────────
export interface ReportAggregate {
  n: number;    // number of reports
  mean: number; // mean community fit ∈ [0,1] (e.g. avg_score/10 from DB)
}

// ── scoring output ────────────────────────────────────────────────────────────
export interface LayerScore { value: number; weight: number; n: number; }
export interface ScoredProduct {
  productId: string; batchId: string;
  matchPct: number;
  confidence: number;
  reasonHuman: string;
  topLayer: 'prior' | 'measured' | 'community';
}
export interface BasketBag { batchId: string; role: string; matchPct: number; grams: number; category: string; }
export interface BasketPlan { bags: BasketBag[]; coverage: { times: TimeOfDay[]; goals: EffectAxis[] }; warnings: string[]; }
