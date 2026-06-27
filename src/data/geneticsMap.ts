/**
 * Master Genetics Map — in-memory seed data.
 * Founder: verify these against your Israeli-market knowledge before using in production.
 * Your knowledge of what D51/Solo AKA actually are overrides any global database.
 *
 * Design rules:
 *   • identity = genetics, not cultivator (D51 and Solo AKA are one node)
 *   • competing parentages use different hypothesisId values (h0 = primary for derivation)
 *   • effectVec = expert-calibrated lean, not a certainty
 *   • Biscotti×Gelato has NO effectVec — derivePhenoPrior computes it
 */

import type {
  GeneticsNode, LineageEdge, CultivationModifier, CultivationMethod,
} from '../engine/types';

// ── 12 verified starter nodes ─────────────────────────────────────────────────

export const GENETICS_NODES: Record<string, GeneticsNode> = {

  'hindu-kush': {
    id: 'hindu-kush',
    displayName: 'Hindu Kush',
    aliases: ['Hindu-Kush', 'HK'],
    nodeType: 'landrace',
    effectVec: { bodyCalm: 0.8, sleep: 0.7, antiPain: 0.6, antiAnxiety: 0.3, mood: 0.2, clearHead: 0.1, appetite: 0.3 },
    priorSource: 'expert',
    priorConf: 0.65,
    topTerpenes: ['myrcene', 'caryophyllene'],
    notes: 'Central Asian landrace; myrcene + caryophyllene dominant.',
  },

  'durban': {
    id: 'durban',
    displayName: 'Durban',
    aliases: ['Durban Poison', 'F1 Durban'],
    nodeType: 'landrace',
    effectVec: { clearHead: 0.8, mood: 0.7, antiAnxiety: 0.2, bodyCalm: 0.1, sleep: 0.1, antiPain: 0.1, appetite: 0.2 },
    priorSource: 'expert',
    priorConf: 0.65,
    topTerpenes: ['terpinolene'],
    notes: 'South African sativa landrace; terpinolene dominant.',
  },

  'og-kush-sf': {
    id: 'og-kush-sf',
    displayName: 'OG Kush SF',
    aliases: ['OG Kush', 'Emerald OG', 'OGK'],
    nodeType: 'hybrid',
    effectVec: { antiAnxiety: 0.6, antiPain: 0.6, mood: 0.5, bodyCalm: 0.4, sleep: 0.3, clearHead: 0.3, appetite: 0.2 },
    priorSource: 'expert',
    priorConf: 0.60,
    topTerpenes: ['limonene', 'caryophyllene'],
    notes: 'Emerald Triangle × Hindu Kush; foundational West-Coast hybrid.',
  },

  'gsc': {
    id: 'gsc',
    displayName: 'GSC',
    aliases: ['Girl Scout Cookies', 'Cookies', 'Forum Cookies'],
    nodeType: 'hybrid',
    effectVec: { mood: 0.7, antiAnxiety: 0.5, bodyCalm: 0.5, antiPain: 0.4, clearHead: 0.3, sleep: 0.3, appetite: 0.3 },
    priorSource: 'expert',
    priorConf: 0.60,
    topTerpenes: ['caryophyllene', 'limonene', 'humulene'],
    notes: 'OG Kush × F1 Durban. Iconic SF hybrid; well-characterized profile.',
  },

  'sunset-sherbet': {
    id: 'sunset-sherbet',
    displayName: 'Sunset Sherbet',
    aliases: ['Sunset Sherbert', 'Sherbet', 'Sherbert'],
    nodeType: 'hybrid',
    effectVec: { mood: 0.7, bodyCalm: 0.6, antiAnxiety: 0.5, sleep: 0.4, antiPain: 0.3, clearHead: 0.2, appetite: 0.3 },
    priorSource: 'expert',
    priorConf: 0.55,
    topTerpenes: ['caryophyllene', 'limonene', 'myrcene'],
    notes: 'GSC × Pink Panties.',
  },

  'gelato': {
    id: 'gelato',
    displayName: 'Gelato',
    aliases: ['Gelato #33', 'Gelato #41', 'Larry Bird', 'Gellati'],
    nodeType: 'hybrid',
    effectVec: { mood: 0.8, bodyCalm: 0.6, antiAnxiety: 0.5, antiPain: 0.4, sleep: 0.3, clearHead: 0.3, appetite: 0.2 },
    priorSource: 'expert',
    priorConf: 0.60,
    topTerpenes: ['caryophyllene', 'limonene', 'linalool'],
    notes: 'Sunset Sherbet × Thin Mint GSC. Well-documented terpene profile.',
  },

  'sf-og': {
    id: 'sf-og',
    displayName: 'South Florida OG',
    aliases: ['SF OG', 'SFOG', 'SFV OG'],
    nodeType: 'hybrid',
    effectVec: { antiPain: 0.7, bodyCalm: 0.6, antiAnxiety: 0.5, sleep: 0.4, mood: 0.3, clearHead: 0.2, appetite: 0.1 },
    priorSource: 'expert',
    priorConf: 0.55,
    topTerpenes: ['caryophyllene', 'myrcene', 'limonene'],
    notes: 'OG Kush South Florida phenotype.',
  },

  'biscotti': {
    id: 'biscotti',
    displayName: 'Biscotti',
    aliases: [],
    nodeType: 'hybrid',
    effectVec: { antiAnxiety: 0.7, mood: 0.6, bodyCalm: 0.6, antiPain: 0.5, sleep: 0.4, clearHead: 0.3, appetite: 0.1 },
    priorSource: 'expert',
    priorConf: 0.55,
    topTerpenes: ['limonene', 'caryophyllene', 'linalool', 'myrcene'],
    notes: 'h0: SF OG × Gelato#25; h1: +GSC (competing claim). Use h0 for derivation.',
  },

  'ogkb': {
    id: 'ogkb',
    displayName: 'OGKB',
    aliases: ['OG Kush Breath', 'OG KB'],
    nodeType: 'phenotype',
    effectVec: { bodyCalm: 0.8, sleep: 0.6, antiPain: 0.5, antiAnxiety: 0.3, mood: 0.3, clearHead: 0.1, appetite: 0.2 },
    priorSource: 'expert',
    priorConf: 0.55,
    topTerpenes: ['linalool', 'caryophyllene', 'myrcene'],
    notes: 'GSC phenotype. Very heavy body effect.',
  },

  'face-off-og': {
    id: 'face-off-og',
    displayName: 'Face Off OG',
    aliases: ['FaceOff OG', 'Face OG'],
    nodeType: 'hybrid',
    effectVec: { antiPain: 0.8, bodyCalm: 0.7, sleep: 0.5, antiAnxiety: 0.4, mood: 0.3, clearHead: 0.2, appetite: 0.1 },
    priorSource: 'expert',
    priorConf: 0.55,
    topTerpenes: ['caryophyllene', 'limonene', 'myrcene'],
    notes: 'OG Kush backcross. Strong analgesic prior.',
  },

  'do-si-dos': {
    id: 'do-si-dos',
    displayName: 'Do-Si-Dos',
    aliases: ['Dosidos', 'DSDS', 'Do Si Dos'],
    nodeType: 'hybrid',
    effectVec: { antiAnxiety: 0.7, bodyCalm: 0.7, antiPain: 0.6, mood: 0.5, sleep: 0.4, clearHead: 0.2, appetite: 0.2 },
    priorSource: 'expert',
    priorConf: 0.60,
    topTerpenes: ['linalool', 'caryophyllene', 'limonene', 'humulene'],
    notes: 'h0: OGKB × Face Off OG (Archive Seeds); h1: Face Off OG × GSC. ' +
           'linalool often dominant — offspring departure; derivation yields to measured.',
  },

  // ── The key identity case: same cross, two cultivators ───────────────────────
  // D51 (Seach cultivar) and Solo AKA (Solo cultivar) are both Biscotti × Gelato.
  // They are the SAME genetics_node — they differ only as batches.
  'biscotti-gelato': {
    id: 'biscotti-gelato',
    displayName: 'Biscotti × Gelato',
    aliases: ['D51', 'Solo AKA', 'Biscotti x Gelato', 'Biscotti Gelato', 'BG'],
    nodeType: 'hybrid',
    // No effectVec — derivePhenoPrior derives it from Biscotti + Gelato parents.
    priorSource: 'derived',
    priorConf: 0.0,
    topTerpenes: ['limonene', 'caryophyllene', 'linalool'],
    notes: 'Biscotti × Gelato. D51 (Seach) and Solo AKA (Solo) are both this cross. ' +
           'Identity = genetics, not cultivator.',
  },
};

// ── Lineage edges ──────────────────────────────────────────────────────────────
// derivePhenoPrior uses hypothesis 0 (primary claim) only.
export const LINEAGE_EDGES: LineageEdge[] = [
  // GSC = OG Kush × F1 Durban
  { childId: 'gsc', parentId: 'og-kush-sf', hypothesisId: 0, parentWeight: 0.5, edgeConf: 0.80, source: 'Cookies Fam' },
  { childId: 'gsc', parentId: 'durban',      hypothesisId: 0, parentWeight: 0.5, edgeConf: 0.80, source: 'Cookies Fam' },

  // Sunset Sherbet = GSC × Pink Panties (Pink Panties not in map → one parent; expert vec)
  { childId: 'sunset-sherbet', parentId: 'gsc', hypothesisId: 0, parentWeight: 0.5, edgeConf: 0.75, source: 'Archive Seeds' },

  // Gelato = Sunset Sherbet × Thin Mint GSC (≈ GSC pheno)
  { childId: 'gelato', parentId: 'sunset-sherbet', hypothesisId: 0, parentWeight: 0.5, edgeConf: 0.85, source: 'Cookies Fam' },
  { childId: 'gelato', parentId: 'gsc',             hypothesisId: 0, parentWeight: 0.5, edgeConf: 0.85, source: 'Thin Mint ≈ GSC pheno' },

  // OGKB = GSC phenotype
  { childId: 'ogkb', parentId: 'gsc', hypothesisId: 0, parentWeight: 1.0, edgeConf: 0.70, source: 'community consensus' },

  // South Florida OG = OG Kush pheno
  { childId: 'sf-og', parentId: 'og-kush-sf', hypothesisId: 0, parentWeight: 1.0, edgeConf: 0.75, source: 'cultivar notes' },

  // Biscotti h0: SF OG × Gelato#25
  { childId: 'biscotti', parentId: 'sf-og',  hypothesisId: 0, parentWeight: 0.5, edgeConf: 0.75, source: 'Cookies Fam' },
  { childId: 'biscotti', parentId: 'gelato', hypothesisId: 0, parentWeight: 0.5, edgeConf: 0.75, source: 'Cookies Fam' },

  // Biscotti h1: SF OG × Gelato × GSC (competing claim — ignored by derivation)
  { childId: 'biscotti', parentId: 'sf-og',  hypothesisId: 1, parentWeight: 0.34, edgeConf: 0.45, source: 'competing claim' },
  { childId: 'biscotti', parentId: 'gelato', hypothesisId: 1, parentWeight: 0.33, edgeConf: 0.45, source: 'competing claim' },
  { childId: 'biscotti', parentId: 'gsc',    hypothesisId: 1, parentWeight: 0.33, edgeConf: 0.45, source: 'competing claim' },

  // Do-Si-Dos h0: OGKB × Face Off OG (Archive Seeds — primary)
  { childId: 'do-si-dos', parentId: 'ogkb',        hypothesisId: 0, parentWeight: 0.5, edgeConf: 0.85, source: 'Archive Seeds' },
  { childId: 'do-si-dos', parentId: 'face-off-og', hypothesisId: 0, parentWeight: 0.5, edgeConf: 0.85, source: 'Archive Seeds' },

  // Do-Si-Dos h1: Face Off OG × GSC (competing claim — ignored by derivation)
  { childId: 'do-si-dos', parentId: 'face-off-og', hypothesisId: 1, parentWeight: 0.5, edgeConf: 0.50, source: 'competing claim' },
  { childId: 'do-si-dos', parentId: 'gsc',          hypothesisId: 1, parentWeight: 0.5, edgeConf: 0.50, source: 'competing claim' },

  // Biscotti × Gelato (D51 / Solo AKA) ← core identity proof
  { childId: 'biscotti-gelato', parentId: 'biscotti', hypothesisId: 0, parentWeight: 0.5, edgeConf: 0.90, source: 'cross name' },
  { childId: 'biscotti-gelato', parentId: 'gelato',   hypothesisId: 0, parentWeight: 0.5, edgeConf: 0.90, source: 'cross name' },
];

// ── Cultivation modifiers ──────────────────────────────────────────────────────
// COUNTERINTUITIVE (Israeli agronomy literature): greenhouse > indoor for terpene quantity.
// Affects flower QUANTITY only — not relative terpene profile shape.
// Measured batch COA data always overrides this modifier.
export const CULTIVATION_MODIFIERS: Record<CultivationMethod, CultivationModifier> = {
  greenhouse:  { method: 'greenhouse',  terpeneScale: 1.10, notes: 'Full-sun broad-spectrum → richer expression' },
  indoor:      { method: 'indoor',      terpeneScale: 0.95, notes: 'LED narrow-spectrum → slightly lower terpene quantity' },
  outdoor:     { method: 'outdoor',     terpeneScale: 1.05, notes: 'Natural full-sun → moderate enrichment' },
  hybrid_grow: { method: 'hybrid_grow', terpeneScale: 1.05, notes: 'Mixed; tends toward greenhouse quality' },
};
