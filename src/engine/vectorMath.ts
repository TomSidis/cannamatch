import type { EffectVector, EffectAxis, Terpene, Batch, Chemotype, Provenance, UserNeed, TerpeneReading, TimeOfDay } from './types';
import { EFFECT_AXIS_KEYS } from './types';
import { TERPENE_EFFECTS, CONDITION_LEANS, CHEMOTYPE_MARKERS } from '../data/terpeneScience';

// ── §4.1 cosine ───────────────────────────────────────────────────────────────
// Standard cosine over fixed key order. Returns 0 when either norm is 0 (§7).
export function cosine(a: EffectVector, b: EffectVector): number {
  let dot = 0, na = 0, nb = 0;
  for (const k of EFFECT_AXIS_KEYS) {
    const av = a[k] ?? 0;
    const bv = b[k] ?? 0;
    dot += av * bv;
    na  += av * av;
    nb  += bv * bv;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export function zeroVec(): EffectVector {
  return { bodyCalm: 0, clearHead: 0, sleep: 0, antiPain: 0, mood: 0, antiAnxiety: 0, appetite: 0 };
}

export function normalizeVec(v: EffectVector): EffectVector {
  const max = Math.max(...EFFECT_AXIS_KEYS.map(k => Math.abs(v[k] ?? 0)), 1e-9);
  const out = zeroVec();
  for (const k of EFFECT_AXIS_KEYS) out[k] = Math.max(0, (v[k] ?? 0) / max);
  return out;
}

function addVec(acc: EffectVector, src: Partial<Record<EffectAxis, number>>, scale = 1): void {
  for (const k of EFFECT_AXIS_KEYS) {
    const v = src[k as EffectAxis];
    if (v !== undefined) acc[k as EffectAxis] += v * scale;
  }
}

// ── §4 buildProductVector ─────────────────────────────────────────────────────
// If batch.terpenes is non-empty → measured layer (declared/measured provenance).
// If empty → derive from chemotype prior (inferred).
export function buildProductVector(batch: Batch): { vec: EffectVector; chemotype: Chemotype; provenance: Provenance } {
  if (batch.terpenes.length > 0) {
    return { vec: vecFromReadings(batch.terpenes), chemotype: chemotypeFromBatch(batch), provenance: batch.provenance };
  }
  const chem = chemotypeFromBatch(batch);
  return { vec: vecFromChemotypePrior(chem), chemotype: chem, provenance: 'inferred' };
}

// Always uses chemotype prior — used for the §4.2 `prior` layer regardless of whether
// the batch has terpene readings. Keeps prior stable and independent of measured data.
export function buildPriorVector(batch: Batch): EffectVector {
  return vecFromChemotypePrior(chemotypeFromBatch(batch));
}

// ── §4 buildNeedVector ────────────────────────────────────────────────────────
// Accepts the existing `ans` object from onboarding. Pure, deterministic.
export function buildNeedVector(ans: {
  reasons?: string[];
  cats?: string[];
  licenseCategories?: string[];
  gramsByCategory?: Record<string, number>;
  terpWeights?: Record<string, number>;
  timing?: string[];
  killSwitches?: Terpene[];
}): UserNeed {
  const conditions = (ans.reasons ?? []).filter(Boolean);
  const acc = zeroVec();

  // Accumulate condition leans
  for (const cond of conditions) {
    const lean = CONDITION_LEANS.find(c => c.condition === cond);
    if (!lean) continue;
    addVec(acc, lean.lean);
  }

  // Time-of-day modifiers (derived from conditions when not explicit)
  const times = deriveTimes(conditions, ans.timing ?? []);
  applyTimeModifiers(acc, times);

  // Normalize to [0..1]
  const effect = normalizeVec(acc);

  return {
    effect,
    times,
    conditions,
    killSwitches:      ans.killSwitches ?? [],
    licenseCategories: ans.licenseCategories ?? ans.cats ?? [],
    gramsByCategory:   ans.gramsByCategory ?? {},
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────────
function vecFromReadings(readings: TerpeneReading[]): EffectVector {
  const acc = zeroVec();
  for (const { terpene, pct } of readings) {
    const def = TERPENE_EFFECTS.find(e => e.terpene === terpene);
    if (!def || pct <= 0) continue;
    addVec(acc, def.effects, pct);
  }
  return normalizeVec(acc);
}

function vecFromChemotypePrior(chem: Chemotype): EffectVector {
  const markers = CHEMOTYPE_MARKERS[chem] ?? [];
  if (markers.length === 0) return zeroVec();
  const share = 1 / markers.length;
  const readings: TerpeneReading[] = markers.map(t => ({ terpene: t, pct: share }));
  return vecFromReadings(readings);
}

export function chemotypeFromBatch(batch: Batch): Chemotype {
  if (batch.thcPct > 0 || batch.cbdPct > 0) {
    const ratio = batch.cbdPct > 0 ? batch.thcPct / batch.cbdPct : Infinity;
    if (ratio >= 3) return 'thcDominant';
    if (ratio <= 0.33) return 'cbdDominant';
    return 'balanced';
  }
  // Fallback: derive from category string "T22/C4"
  const m = batch.category.match(/T(\d+)\/C(\d+)/i);
  if (!m) return 'thcDominant';
  const thc = parseInt(m[1]), cbd = parseInt(m[2]);
  const ratio = cbd > 0 ? thc / cbd : Infinity;
  if (ratio >= 3) return 'thcDominant';
  if (ratio <= 0.33) return 'cbdDominant';
  return 'balanced';
}

function deriveTimes(conditions: string[], explicit: string[]): TimeOfDay[] {
  if (explicit.length > 0) return explicit as TimeOfDay[];
  const set = new Set<TimeOfDay>();
  for (const c of conditions) {
    if (c === 'sleep')   { set.add('evening'); set.add('night'); }
    if (c === 'focus')   { set.add('morning'); set.add('noon'); }
    if (c === 'anxiety') { set.add('morning'); set.add('afternoon'); set.add('evening'); }
    if (c === 'ptsd')    { set.add('evening'); set.add('night'); }
    if (c === 'pain')    { set.add('morning'); set.add('noon'); set.add('afternoon'); set.add('evening'); }
    if (c === 'mood')    { set.add('morning'); set.add('noon'); }
    if (c === 'appetite'){ set.add('noon'); set.add('afternoon'); }
  }
  return set.size > 0 ? Array.from(set) : ['morning', 'evening'];
}

function applyTimeModifiers(acc: EffectVector, times: TimeOfDay[]): void {
  for (const t of times) {
    if (t === 'morning' || t === 'noon') {
      acc.clearHead  += 0.3;
      acc.mood       += 0.2;
      acc.sleep      = Math.max(0, acc.sleep - 0.2);
    }
    if (t === 'evening' || t === 'night') {
      acc.bodyCalm   += 0.3;
      acc.sleep      += 0.2;
      acc.antiAnxiety+= 0.15;
    }
  }
}
