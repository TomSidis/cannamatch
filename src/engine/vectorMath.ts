import type { EffectVector, EffectAxis, Terpene, Batch, Chemotype, Provenance, UserNeed, TerpeneReading, TimeOfDay } from './types.ts';
import { EFFECT_AXIS_KEYS } from './types.ts';
import { TERPENE_EFFECTS, CONDITION_LEANS, CHEMOTYPE_MARKERS } from '../data/terpeneScience.ts';
import { resolveGenetics, derivePhenoPrior } from './genetics.ts';

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

// Prior layer: genetics-derived (or batch-measured) vec if available; else chemotype.
// Genetics prior always outranks chemotype prior because it carries identity information.
export function buildPriorVector(batch: Batch): EffectVector {
  if (batch.geneticsPrior && batch.geneticsPrior.conf > 0) {
    return fillEffectVec(batch.geneticsPrior.vec);
  }
  return vecFromChemotypePrior(chemotypeFromBatch(batch));
}

function fillEffectVec(partial: Partial<Record<EffectAxis, number>>): EffectVector {
  const out = zeroVec();
  for (const k of EFFECT_AXIS_KEYS) out[k] = partial[k as EffectAxis] ?? 0;
  return out;
}

// B3: weight for a single onboarding strain pick (form[]).
// 0.3 ensures tried strains nudge, not anchor, the need vector.
const SINGLE_PICK_WEIGHT = 0.3;

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
  // B3: tried-strain picks. Each is a strain name resolved via genetics.
  // Contributes at SINGLE_PICK_WEIGHT (0.3) — weak signal, not an anchor.
  form?: string[];
  // Layer 3: cannabis experience. 'first'/'little' = non-veteran → new-user route ON.
  // 'experienced' = veteran (≥1yr) → route only when anxiety is a stated indication.
  experience?: 'first' | 'little' | 'experienced';
}): UserNeed {
  const conditions = (ans.reasons ?? []).filter(Boolean);
  const acc = zeroVec();

  // Accumulate condition leans (weight 1.0)
  for (const cond of conditions) {
    const lean = CONDITION_LEANS.find(c => c.condition === cond);
    if (!lean) continue;
    addVec(acc, lean.lean);
  }

  // B3: single-pick decay — tried strains add a weak nudge (0.3×) to the need vec.
  // 0.3 ensures one pick never anchors results; community reports correct it over time.
  if (ans.form?.length) {
    for (const name of ans.form) {
      const node = resolveGenetics(name);
      if (!node) continue;
      const prior = derivePhenoPrior(node.id);
      if (prior.conf > 0) addVec(acc, prior.vec, SINGLE_PICK_WEIGHT);
    }
  }

  // Time-of-day modifiers (derived from conditions when not explicit)
  const times = deriveTimes(conditions, ans.timing ?? []);
  applyTimeModifiers(acc, times);

  // Normalize to [0..1]
  const effect = normalizeVec(acc);

  // New-user route gate. Non-veterans (first/little) always get it; a veteran gets it
  // only when anxiety is their stated indication. Unknown experience → off (conservative:
  // never silently re-route a returning user). Existing callers omit experience → off.
  const exp = ans.experience;
  const newUserRoute = exp
    ? (exp !== 'experienced' || conditions.includes('anxiety'))
    : false;

  return {
    effect,
    times,
    conditions,
    killSwitches:      ans.killSwitches ?? [],
    licenseCategories: ans.licenseCategories ?? ans.cats ?? [],
    gramsByCategory:   ans.gramsByCategory ?? {},
    newUserRoute,
  };
}

// B3: "minimum signal" guard.
// License = eligibility filter only — never a scoring input by itself.
// Returns true when the ans contains at least one preference signal beyond license.
// Call before scoreAll; if false, show the "needs one more signal" onboarding nudge.
export function hasMinimumSignal(ans: {
  reasons?: string[];
  timing?: string[];
  killSwitches?: string[];
  terpWeights?: Record<string, number>;
  form?: string[];
}): boolean {
  return (
    (ans.reasons?.length ?? 0) > 0 ||
    (ans.timing?.length ?? 0) > 0 ||
    (ans.killSwitches?.length ?? 0) > 0 ||
    Object.keys(ans.terpWeights ?? {}).length > 0 ||
    (ans.form?.length ?? 0) > 0
  );
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
