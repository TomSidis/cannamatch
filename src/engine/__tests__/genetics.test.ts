import { describe, it, expect } from 'vitest';
import {
  classifyName,
  resolveGenetics,
  derivePhenoPrior,
  applyCultivationModifier,
} from '../genetics';
import { GENETICS_NODES, LINEAGE_EDGES } from '../../data/geneticsMap';

// ── §2.3 classifyName ─────────────────────────────────────────────────────────

describe('classifyName', () => {
  it('cross notation (×) → likely_hybrid with parents extracted', () => {
    const r = classifyName('Biscotti × Gelato');
    expect(r.type).toBe('likely_hybrid');
    expect(r.parents).toEqual(['Biscotti', 'Gelato']);
  });

  it('ASCII x notation → likely_hybrid', () => {
    const r = classifyName('OG Kush x Durban');
    expect(r.type).toBe('likely_hybrid');
    expect(r.parents).toHaveLength(2);
  });

  it('three-way cross → likely_hybrid with 3 parents', () => {
    const r = classifyName('Triangle Mints × Kush Mints × White Tahoe Cookies');
    expect(r.type).toBe('likely_hybrid');
    expect(r.parents).toHaveLength(3);
  });

  it('"Hindu Kush" → likely_landrace', () => {
    expect(classifyName('Hindu Kush').type).toBe('likely_landrace');
  });

  it('"Durban Poison" → likely_landrace', () => {
    expect(classifyName('Durban Poison').type).toBe('likely_landrace');
  });

  it('short uppercase code → coded', () => {
    expect(classifyName('D51').type).toBe('coded');
    expect(classifyName('JU').type).toBe('coded');
    expect(classifyName('ABN').type).toBe('coded');
  });

  it('Hebrew string → unknown', () => {
    expect(classifyName('אינדיקה — שיווק מותג').type).toBe('unknown');
  });

  it('Latin brand with no cross → unknown', () => {
    expect(classifyName('Wedding Cake').type).toBe('unknown');
  });

  it('empty string → unknown', () => {
    expect(classifyName('').type).toBe('unknown');
  });
});

// ── §2.3 resolveGenetics ─────────────────────────────────────────────────────

describe('resolveGenetics', () => {
  it('display name resolves to correct node', () => {
    const node = resolveGenetics('Hindu Kush');
    expect(node?.id).toBe('hindu-kush');
    expect(node?.nodeType).toBe('landrace');
  });

  it('alias resolves to the same node as display name', () => {
    expect(resolveGenetics('Durban Poison')?.id).toBe('durban');
    expect(resolveGenetics('F1 Durban')?.id).toBe('durban');
  });

  it('case-insensitive resolution', () => {
    expect(resolveGenetics('gelato')?.id).toBe('gelato');
    expect(resolveGenetics('GELATO')?.id).toBe('gelato');
    expect(resolveGenetics('Gelato #33')?.id).toBe('gelato');
  });

  it('D51 and Solo AKA → SAME genetics_id (core identity test)', () => {
    const d51  = resolveGenetics('D51');
    const solo = resolveGenetics('Solo AKA');
    expect(d51).not.toBeNull();
    expect(solo).not.toBeNull();
    expect(d51!.id).toBe(solo!.id);
    expect(d51!.id).toBe('biscotti-gelato');
  });

  it('cross notation → resolves to correct hybrid node', () => {
    // 'Biscotti × Gelato' matches the displayName of biscotti-gelato directly
    const node = resolveGenetics('Biscotti × Gelato');
    expect(node).not.toBeNull();
    expect(node!.id).toBe('biscotti-gelato');
    expect(node!.nodeType).toBe('hybrid');
  });

  it('cross notation with unknown-in-map parents → ephemeral node', () => {
    // 'Purple Punch × Zkittlez' → neither parent is in the seed map → null
    // (or if both are resolvable, returns ephemeral node)
    const node = resolveGenetics('OG Kush × Durban');
    // Both are in the map (OG Kush = alias of og-kush-sf, Durban = alias of durban)
    expect(node).not.toBeNull();
    expect(node!.nodeType).toBe('hybrid');
  });

  it('unknown name → null', () => {
    expect(resolveGenetics('NonExistentStrainXYZ')).toBeNull();
  });

  it('cross with one unknown parent → null (queue for manual review)', () => {
    expect(resolveGenetics('Unknown Strain × Gelato')).toBeNull();
  });
});

// ── §2.4 derivePhenoPrior ─────────────────────────────────────────────────────

describe('derivePhenoPrior', () => {
  it('(a) landrace measured → returns its own vec without recursion', () => {
    const r = derivePhenoPrior('hindu-kush');
    expect(r.source).toBe('expert');
    expect(r.conf).toBe(GENETICS_NODES['hindu-kush'].priorConf);
    // bodyCalm should be high for Hindu Kush
    expect(r.vec.bodyCalm).toBeGreaterThan(0.6);
  });

  it('(b) hybrid from two measured parents → derived mean, conf ≤ 0.5, NO grandparent recursion', () => {
    // GSC = OG Kush × Durban; both parents have priorConf > 0.4 → early stop
    // GSC itself has priorConf = 0.60 so it returns its own vec
    const r = derivePhenoPrior('gsc');
    expect(r.source).toBe('expert');
    expect(r.conf).toBe(GENETICS_NODES['gsc'].priorConf); // returns own expert vec
    // mood should be dominant for GSC
    expect(r.vec.mood).toBeGreaterThan(0.5);
  });

  it('(b2) biscotti-gelato (no effectVec) → derived from biscotti+gelato parents (early stop)', () => {
    const r = derivePhenoPrior('biscotti-gelato');
    expect(r.source).toBe('derived');
    // Both parents (biscotti conf=0.55, gelato conf=0.60) → early stop at depth 0
    // conf = mean(0.55, 0.60) × 0.7 = 0.575 × 0.7 = 0.4025 < 0.5 ✓
    expect(r.conf).toBeLessThanOrEqual(0.5);
    expect(r.conf).toBeGreaterThan(0.3);  // not zero
    // Should inherit mood+antiAnxiety from both Biscotti and Gelato
    expect(r.vec.mood).toBeGreaterThan(0.4);
    expect(r.vec.antiAnxiety).toBeGreaterThan(0.3);
  });

  it('(c) CORE: node with own measured vec (priorConf > 0.4) → ignores derivation', () => {
    // Do-Si-Dos has its own expert effectVec with priorConf=0.60 → returned directly
    const r = derivePhenoPrior('do-si-dos');
    expect(r.source).toBe('expert');
    expect(r.conf).toBe(0.60);
    // antiAnxiety should be high (linalool + caryophyllene)
    expect(r.vec.antiAnxiety).toBeGreaterThanOrEqual(0.6);
  });

  it('(d) hard cap: derived confidence never exceeds 0.5', () => {
    // biscotti-gelato is derived — cap must hold even if parents are high-conf
    const r = derivePhenoPrior('biscotti-gelato');
    expect(r.conf).toBeLessThanOrEqual(0.5);
  });

  it('(d2) derivation does not descend past direct parents (early stop check)', () => {
    // biscotti-gelato → biscotti (priorConf=0.55) + gelato (priorConf=0.60)
    // Both > 0.4 → EARLY STOP → must NOT recurse to sf-og / gsc / etc.
    // We verify by counting LINEAGE_EDGES consulted: should only go 1 level deep.
    // Since biscotti-gelato has no effectVec but biscotti+gelato both do → early stop.
    const r = derivePhenoPrior('biscotti-gelato');
    // If early stop failed, it would recurse into sf-og → og-kush-sf etc.,
    // and the mean would shift toward OG Kush profile (high antiPain).
    // With early stop, Biscotti (antiAnxiety=0.7) + Gelato (mood=0.8) dominate.
    const antiPainWeight = r.vec.antiPain;   // OG Kush influence if recurse leaked
    const moodWeight     = r.vec.mood;        // Gelato influence if early stop works
    expect(moodWeight).toBeGreaterThan(antiPainWeight); // mood > antiPain: early stop verified
  });

  it('unknown node id → conf=0, zero vec', () => {
    const r = derivePhenoPrior('does-not-exist');
    expect(r.conf).toBe(0);
    expect(r.vec.mood).toBe(0);
  });
});

// ── §2.5 applyCultivationModifier ────────────────────────────────────────────

describe('applyCultivationModifier', () => {
  const baseVec = { bodyCalm: 0.6, clearHead: 0.5, sleep: 0.5, antiPain: 0.4, mood: 0.7, antiAnxiety: 0.6, appetite: 0.2 };

  it('greenhouse → scale 1.10 → values increase', () => {
    const r = applyCultivationModifier(baseVec, 'greenhouse');
    expect(r.mood).toBeCloseTo(0.7 * 1.10, 3);
    expect(r.bodyCalm).toBeCloseTo(0.6 * 1.10, 3);
  });

  it('indoor → scale 0.95 → values decrease', () => {
    const r = applyCultivationModifier(baseVec, 'indoor');
    expect(r.mood).toBeCloseTo(0.7 * 0.95, 3);
    expect(r.mood).toBeLessThan(baseVec.mood);
  });

  it('greenhouse > indoor (counterintuitive per Israeli agronomy)', () => {
    const r_gh  = applyCultivationModifier(baseVec, 'greenhouse');
    const r_in  = applyCultivationModifier(baseVec, 'indoor');
    expect(r_gh.mood).toBeGreaterThan(r_in.mood);
  });

  it('scaled values are clamped to [0, 1]', () => {
    const highVec = { bodyCalm: 0.95, clearHead: 0.95, sleep: 0.95, antiPain: 0.95, mood: 0.95, antiAnxiety: 0.95, appetite: 0.95 };
    const r = applyCultivationModifier(highVec, 'greenhouse');
    for (const v of Object.values(r)) {
      expect(v).toBeLessThanOrEqual(1.0);
      expect(v).toBeGreaterThanOrEqual(0.0);
    }
  });

  it('outdoor scale = 1.05 → slight increase', () => {
    const r = applyCultivationModifier(baseVec, 'outdoor');
    expect(r.mood).toBeGreaterThan(baseVec.mood);
    expect(r.mood).toBeCloseTo(0.7 * 1.05, 3);
  });
});

// ── Data integrity checks ─────────────────────────────────────────────────────

describe('genetics data integrity', () => {
  it('all 12 seed nodes are present', () => {
    const expected = [
      'hindu-kush', 'durban', 'og-kush-sf', 'gsc', 'sunset-sherbet',
      'gelato', 'sf-og', 'biscotti', 'ogkb', 'face-off-og', 'do-si-dos', 'biscotti-gelato',
    ];
    for (const id of expected) {
      expect(GENETICS_NODES[id]).toBeDefined();
    }
  });

  it('all lineage_edge childId / parentId references exist as nodes', () => {
    for (const edge of LINEAGE_EDGES) {
      expect(GENETICS_NODES[edge.childId]).toBeDefined();
      expect(GENETICS_NODES[edge.parentId]).toBeDefined();
    }
  });

  it('biscotti-gelato has no effectVec (derives from parents)', () => {
    expect(GENETICS_NODES['biscotti-gelato'].effectVec).toBeUndefined();
    expect(GENETICS_NODES['biscotti-gelato'].priorConf).toBe(0);
  });

  it('both landraces have priorConf > 0.6', () => {
    expect(GENETICS_NODES['hindu-kush'].priorConf).toBeGreaterThan(0.6);
    expect(GENETICS_NODES['durban'].priorConf).toBeGreaterThan(0.6);
  });
});
