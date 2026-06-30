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

export interface GeneticsPrior {
  vec: EffectVector;
  conf: number;                         // 0..1; derived priors hard-capped at 0.5
  source: PriorSource | 'unknown';
  cultivationMethod?: CultivationMethod; // optional — from grow_batch row
}

export interface Batch {
  id: string; productId: string;
  thcPct: number; cbdPct: number;
  terpenes: TerpeneReading[];
  provenance: Provenance;
  category: string;
  testedAt?: string;
  // Phase 4: genetics-derived or batch-measured prior. Absent → falls back to chemotype prior.
  geneticsPrior?: GeneticsPrior;
  // Phase 3: cultivation method — used for sibling inheritance and UI display.
  cultivationMethod?: CultivationMethod;
  // Phase 3: TRUE when cultivationMethod was inherited from a sibling batch (same genetics_id).
  // Scorer applies a 0.85× confidence penalty within the inferred tier for these batches.
  inheritedCultivation?: boolean;
  // B5: genetics_node.id — same value across all product_sku twins of the same strain.
  geneticsId?: string;
  // B5: false = OOS; triggers twin substitution in findTwinSubstitutes.
  inStock?: boolean;
  // B5: display name (commercial_name from product_sku). Used in twin menu row.
  commercialName?: string;
}

// ── B5: Twin substitution ─────────────────────────────────────────────────────
// A TwinCandidate is an available substitute for an OOS batch.
// Intentionally has NO price field — price is NEVER shown next to a match %.
export interface TwinCandidate {
  batchId: string;
  productId: string;
  commercialName: string;        // product name for the menu row
  matchPct: number;              // from scorer (same need vector as the original)
  confidence: number;
  twinReason: 'same_genetics' | 'similar_terpenes' | 'near_chemotype';
  reasonHuman: string;           // short Hebrew why (no chemistry, no price)
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
  // NEW-USER ROUTE: when true the scorer applies a bounded anxiolytic / lower-THC
  // tie-breaker on top of indication fit (first-timers & non-veterans; veterans only
  // when anxiety is their stated indication). Indication fit always leads.
  newUserRoute: boolean;
  // DISLIKE DEMOTION: effect vector derived from the disliked onboarding pick (chemovar +
  // dominant terpenes). Strains chemically similar to it get a bounded rank demotion in the
  // scorer — symmetric to the liked single-pick boost. null/absent → no demotion (first-timers,
  // legacy callers). Never a hard exclude.
  dislikedProfile?: EffectVector | null;
}

// ── community reports (pre-aggregated, keyed by grow_batch_id NOT strain) ────
export interface ReportAggregate {
  n: number;    // number of reports for THIS batch
  mean: number; // mean community fit ∈ [0,1] (e.g. avg_score/10 from DB)
}

// Map: grow_batch_id → ReportAggregate
export type BatchReportMap = Record<string, ReportAggregate>;

// ── batch-level adverse signal ────────────────────────────────────────────────
export interface AxialReport {
  batchId: string;
  axis: EffectAxis;
  score: number;             // 0..1; adverse = score < ADVERSE_THRESHOLD (0.4)
  cultivationMethod?: CultivationMethod;
  // Q11: per-report trust weight ∈ [0.10, 1.00]. Absent → treated as 1.0.
  // Feeds into weighted Bayesian aggregation (aggregateByBatch) and adverseRate computation.
  trustWeight?: number;
}

export interface FlaggedBatch {
  batchId: string;
  axis: EffectAxis;
  n: number;
  adverseRate: number;       // fraction of reports that were adverse on this axis
  cultivationSignal?: CultivationMethod; // set when ≥2 flagged batches share a method
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

// ── §2 Genetics Map ───────────────────────────────────────────────────────────
export type NodeType = 'landrace' | 'hybrid' | 'phenotype' | 'backcross';
export type PriorSource = 'measured' | 'derived' | 'expert' | 'placeholder';
export type CultivationMethod = 'indoor' | 'outdoor' | 'greenhouse' | 'hybrid_grow';
export type NameClassificationType = 'likely_hybrid' | 'likely_landrace' | 'coded' | 'unknown';

export interface GeneticsNode {
  id: string;
  displayName: string;
  aliases: string[];
  nodeType: NodeType;
  effectVec?: Partial<EffectVector>;   // undefined = unknown; partial = only known axes
  priorSource: PriorSource;
  priorConf: number;                   // 0..1; any derived value capped at 0.5
  topTerpenes: Terpene[];
  notes?: string;
  // B3: explicit cannabinoid type for Mendelian cross derivation.
  // Optional — deriveCross infers heuristically from effectVec when absent.
  chemotype?: Chemotype;
}

export interface LineageEdge {
  childId: string;
  parentId: string;
  hypothesisId: number;                // 0 = primary; 1+ = competing claim
  parentWeight: number;                // typically 0.5 per parent; sums to 1.0
  edgeConf: number;                    // confidence in this parentage claim (0..1)
  source?: string;
}

export interface CultivationModifier {
  method: CultivationMethod;
  terpeneScale: number;               // multiplier on terpene QUANTITY, not profile shape
  notes?: string;
}

export interface NameClassification {
  type: NameClassificationType;
  parents: string[];                   // non-empty only for likely_hybrid
}

export interface DerivedPrior {
  vec: EffectVector;
  conf: number;                        // 0..1; hard-capped at 0.5 for any derived result
  source: PriorSource | 'unknown';
}
