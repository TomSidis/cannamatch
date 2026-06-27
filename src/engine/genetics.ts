/**
 * genetics.ts — Master Genetics Map engine.
 *
 * Three public entry points:
 *   classifyName(raw)       — 'likely_hybrid' | 'likely_landrace' | 'coded' | 'unknown'
 *   resolveGenetics(name)   — GeneticsNode | null; resolves aliases + cross notation
 *   derivePhenoPrior(id)    — DerivedPrior; weighted mean, decays ×0.7/level, cap 0.5
 *   applyCultivationModifier(vec, method) — scales terpene quantity (not profile shape)
 *
 * Invariants:
 *   • derivePhenoPrior never exceeds depth 3
 *   • EARLY STOP: if all direct parents have priorConf > 0.4, stop — do not recurse further
 *   • A node with its own measured batch (priorConf > 0.5) is never overridden by derivation
 *   • hypothesisId 0 only used for derivation (competing claims are metadata)
 */

import { EFFECT_AXIS_KEYS } from './types.ts';
import type {
  EffectVector, GeneticsNode, DerivedPrior, NameClassification,
  CultivationMethod,
} from './types.ts';
import {
  GENETICS_NODES, LINEAGE_EDGES, CULTIVATION_MODIFIERS,
} from '../data/geneticsMap.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function zeroVec(): EffectVector {
  return { bodyCalm: 0, clearHead: 0, sleep: 0, antiPain: 0, mood: 0, antiAnxiety: 0, appetite: 0 };
}

function fullVec(partial: Partial<EffectVector>): EffectVector {
  const z = zeroVec();
  for (const k of EFFECT_AXIS_KEYS) {
    z[k] = partial[k] ?? 0;
  }
  return z;
}

function normalizedLower(s: string): string {
  return s.trim().toLowerCase();
}

// ── §2.3 classifyName ─────────────────────────────────────────────────────────
// Classifies a raw strain/lineage string for routing decisions.
// Runs on any field: display name, genetics field, or lineage string.

const LANDRACE_KEYWORDS = [
  'Hindu Kush', 'Durban', 'Acapulco', 'Colombian', 'Thai Stick',
  'Afghani', 'Jamaican', 'Panama', 'Malawi',
];

export function classifyName(raw: string): NameClassification {
  if (!raw?.trim()) return { type: 'unknown', parents: [] };

  const trimmed = raw.trim();

  // Cross notation: contains × (U+00D7) or literal " x " / " X "
  // Must have at least one Latin character to filter out pure Hebrew "×" sentences
  const hasCross = /[×]/.test(trimmed) || /\s[xX]\s/.test(trimmed);
  if (hasCross && /[A-Za-z]/.test(trimmed)) {
    // Extract up to 3 parents (handle 3-way crosses: A × B × C)
    const parts = trimmed
      .split(/\s*[×xX]\s*/)
      .map(p => p.replace(/^\(|\)$/g, '').trim()) // strip outer parens
      .filter(Boolean);
    return { type: 'likely_hybrid', parents: parts };
  }

  // Known landrace names (Latin only)
  if (LANDRACE_KEYWORDS.some(kw => trimmed.toLowerCase().includes(kw.toLowerCase()))) {
    return { type: 'likely_landrace', parents: [] };
  }

  // Coded: short ALL-CAPS codes like D51, MC61, JU, P&Z, ABN, CMK
  // Pattern: 1-4 uppercase letters (+ & or digits), length ≤ 5, no spaces
  if (/^[A-Z][A-Z0-9&]{0,3}(\d{1,3})?$/.test(trimmed) && trimmed.length <= 6) {
    return { type: 'coded', parents: [] };
  }

  // Hebrew-majority text → unknown (marketing label, not a genetic identifier)
  if (/[֐-׿]/.test(trimmed)) {
    return { type: 'unknown', parents: [] };
  }

  // Latin name but no recognizable cross / landrace / code pattern
  return { type: 'unknown', parents: [] };
}

// ── §2.3 resolveGenetics ──────────────────────────────────────────────────────
// Returns the canonical GeneticsNode for a raw name, or null if not found.
// Resolution order:
//   1. Exact display_name match (case-insensitive)
//   2. Alias match
//   3. "A × B" cross notation → create ephemeral derived node if both parents known

export function resolveGenetics(raw: string): GeneticsNode | null {
  if (!raw?.trim()) return null;

  const needle = normalizedLower(raw);

  // 1. Display name exact match
  for (const node of Object.values(GENETICS_NODES)) {
    if (normalizedLower(node.displayName) === needle) return node;
  }

  // 2. Alias match
  for (const node of Object.values(GENETICS_NODES)) {
    if (node.aliases.some(a => normalizedLower(a) === needle)) return node;
  }

  // 3. Cross notation: "A × B" → find both parents + create ephemeral node
  const classification = classifyName(raw);
  if (classification.type === 'likely_hybrid' && classification.parents.length >= 2) {
    const [p1Name, p2Name] = classification.parents;
    const p1 = resolveGenetics(p1Name);
    const p2 = resolveGenetics(p2Name);

    if (p1 && p2) {
      // Build a minimal ephemeral node — it is NOT added to GENETICS_NODES.
      // The caller can persist it if they choose to.
      const ephemerealId = `derived:${p1.id}+${p2.id}`;
      const node: GeneticsNode = {
        id:           ephemerealId,
        displayName:  `${p1.displayName} × ${p2.displayName}`,
        aliases:      [raw.trim()],
        nodeType:     'hybrid',
        priorSource:  'derived',
        priorConf:    0.0,
        topTerpenes:  [],
        notes:        `Auto-derived from resolveGenetics("${raw}"). Verify before persisting.`,
      };
      // Register ephemerally so derivePhenoPrior can look up the parents
      _ephemeral[ephemerealId] = { node, parentIds: [p1.id, p2.id] };
      return node;
    }

    // One or both parents unknown → return null + queue for manual review
    return null;
  }

  return null;
}

// Ephemeral in-memory store for auto-derived nodes created by resolveGenetics.
const _ephemeral: Record<string, { node: GeneticsNode; parentIds: string[] }> = {};

// ── §2.4 derivePhenoPrior ─────────────────────────────────────────────────────
// Recursive, hypothesis 0 only, confidence decays ×0.7/level, hard cap 0.5.
// EARLY STOP: if all direct parents have priorConf > 0.4 → use them directly,
//             do NOT recurse to grandparents.

const DECAY   = 0.7;
const CAP     = 0.5;
const DEPTH_MAX = 3;
const EARLY_STOP_THRESHOLD = 0.4;

export function derivePhenoPrior(nodeId: string, depth = 0): DerivedPrior {
  const node = GENETICS_NODES[nodeId] ?? _ephemeral[nodeId]?.node;

  if (!node) return { vec: zeroVec(), conf: 0, source: 'unknown' };

  // Node already has a sufficient measured/expert prior → return it as-is.
  // "sufficient" = priorConf > 0.4 AND effectVec present.
  // (This is also the base case that prevents infinite recursion.)
  if (node.effectVec && node.priorConf > EARLY_STOP_THRESHOLD) {
    return {
      vec:    fullVec(node.effectVec),
      conf:   node.priorConf,
      source: node.priorSource,
    };
  }

  if (depth >= DEPTH_MAX) return { vec: zeroVec(), conf: 0, source: 'derived' };

  // Get h0 parent edges for this node (from LINEAGE_EDGES or ephemeral)
  let h0edges = LINEAGE_EDGES.filter(e => e.childId === nodeId && e.hypothesisId === 0);

  // Handle ephemeral nodes (created by resolveGenetics cross-notation path)
  if (h0edges.length === 0 && _ephemeral[nodeId]) {
    h0edges = _ephemeral[nodeId].parentIds.map(pid => ({
      childId: nodeId, parentId: pid, hypothesisId: 0,
      parentWeight: 0.5, edgeConf: 0.8,
    }));
  }

  if (h0edges.length === 0) return { vec: zeroVec(), conf: 0, source: 'derived' };

  // EARLY STOP: if ALL direct parents have priorConf > threshold AND have effectVec
  // → use them directly, never descend to grandparents.
  const allParentsSufficient = h0edges.every(e => {
    const p = GENETICS_NODES[e.parentId] ?? _ephemeral[e.parentId]?.node;
    return p?.effectVec && (p.priorConf > EARLY_STOP_THRESHOLD);
  });

  // Weighted mean over parents
  const merged = zeroVec();
  let totalWeight = 0;
  let totalConf   = 0;

  for (const edge of h0edges) {
    let parentResult: DerivedPrior;

    if (allParentsSufficient) {
      // Early stop: read parent vec directly, no recursion
      const p = GENETICS_NODES[edge.parentId] ?? _ephemeral[edge.parentId]?.node!;
      parentResult = { vec: fullVec(p.effectVec!), conf: p.priorConf, source: p.priorSource };
    } else {
      // Recurse only for this specific parent (it lacks a sufficient vec)
      parentResult = derivePhenoPrior(edge.parentId, depth + 1);
    }

    const w = edge.parentWeight;
    for (const axis of EFFECT_AXIS_KEYS) {
      merged[axis] += parentResult.vec[axis] * w;
    }
    totalWeight += w;
    totalConf   += parentResult.conf * w;
  }

  // Normalize weighted mean
  if (totalWeight > 0) {
    for (const axis of EFFECT_AXIS_KEYS) merged[axis] /= totalWeight;
    totalConf /= totalWeight;
  }

  // Confidence: decay per depth level, hard cap at CAP (0.5)
  const conf = Math.min(totalConf * DECAY, CAP);

  return { vec: merged, conf, source: 'derived' };
}

// ── §2.5 applyCultivationModifier ─────────────────────────────────────────────
// Scales terpene QUANTITY (all axes proportionally) by the grow method.
// Direction is COUNTERINTUITIVE: greenhouse > indoor per Israeli agronomy.
// Affects flower only. Measured batch terpenes always override (never call this
// after a measured batch has been loaded).

export function applyCultivationModifier(
  vec: EffectVector,
  method: CultivationMethod,
): EffectVector {
  const modifier = CULTIVATION_MODIFIERS[method];
  if (!modifier) return vec;

  const scale = modifier.terpeneScale;
  const result = zeroVec();
  for (const axis of EFFECT_AXIS_KEYS) {
    // Clamp to [0, 1] — scaling cannot push above the axis ceiling
    result[axis] = Math.min(1, Math.max(0, vec[axis] * scale));
  }
  return result;
}
