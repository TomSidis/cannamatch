/**
 * basketRoutes — the two basket routes יקר / זול (Layer 6).
 *
 * Both routes are EQUALLY fit-driven: they share ONE planBasket() selection (the existing
 * Basket Planner does fit-first selection + diversity + gram budgeting). The routes differ
 * ONLY in which PRESENTATION of each already-selected strain to show:
 *   יקר (expensive) → prefer the box (קופסה) / higher-priced offer.
 *   זול (cheap)     → prefer the bag (שקית) / lower-priced offer.
 *
 * Fit always leads — price never enters selection. If a strain has only a box, the cheap
 * route still shows it (best available fit), never dropping to a worse match to hit a price.
 *
 * Iron rule: matchPct and price live in SEPARATE fields (matchPct top-level, price nested in
 * `presentation`) so the renderer never places a price adjacent to a match %.
 */
import { planBasket } from '../engine/basketPlanner.ts';
import { buildNeedVector } from '../engine/vectorMath.ts';
import { strainToBatch } from '../engine/legacyBridge.ts';
import { buildWhy } from './menuRanking.js';

// Pick the presentation for one selected strain from its available menu offers.
//   offers: [{ price, packaging?: 'box'|'bag', format? }]
function chooseOffer(offers, mode) {
  if (!Array.isArray(offers) || offers.length === 0) return null;

  // by-fit: no packaging/price preference — take the representative offer. All offers are
  // presentations of the SAME strain, so they share the strain's fit; price is ignored here.
  if (mode === 'fit') return offers[0];

  const boxes = offers.filter((o) => o.packaging === 'box');
  const bags  = offers.filter((o) => o.packaging === 'bag');

  if (mode === 'expensive') {
    const pool = boxes.length ? boxes : offers;             // prefer box; else best available
    return pool.reduce((m, o) => ((o.price ?? -Infinity) > (m.price ?? -Infinity) ? o : m));
  }
  const pool = bags.length ? bags : offers;                  // prefer bag; else best available
  return pool.reduce((m, o) => ((o.price ?? Infinity) < (m.price ?? Infinity) ? o : m));
}

function toRouteBag(bag, mode, offersByStrain, meta) {
  const offer = chooseOffer(offersByStrain[bag.batchId], mode);
  return {
    batchId:  bag.batchId,
    name:     meta[bag.batchId]?.name ?? bag.batchId,
    why:      meta[bag.batchId]?.why ?? '',
    role:     bag.role,
    grams:    bag.grams,
    category: bag.category,
    matchPct: bag.matchPct,                 // fit — top-level
    // economics — deliberately nested, never rendered beside matchPct
    presentation: offer
      ? { packaging: offer.packaging ?? null, price: offer.price ?? null, format: offer.format ?? null }
      : null,
  };
}

/**
 * buildBasketRoutes — run the planner ONCE, then project the same selection into two routes.
 * @returns { expensive: {bags,coverage,warnings}, cheap: {bags,coverage,warnings}, coverage, warnings }
 */
export function buildBasketRoutes(need, scored, batches, opts = {}) {
  const { offersByStrain = {}, meta = {}, maxBags = 5 } = opts;
  const plan = planBasket(need, scored, batches, { maxBags });
  const route = (mode) => ({
    bags: plan.bags.map((b) => toRouteBag(b, mode, offersByStrain, meta)),
    coverage: plan.coverage,
    warnings: plan.warnings,
  });

  return {
    byFit:     route('fit'),       // PRIMARY — pure best-fit, no price/packaging lean
    cheap:     route('cheap'),     // prefers bag / lower price
    expensive: route('expensive'), // prefers box / higher price
    coverage:  plan.coverage,
    warnings:  plan.warnings,
  };
}

/**
 * buildRoutesFromMenu — convenience for the client: build both routes directly from the
 * merged scan-session items + the user's profile. Each menu item is one offer; multiple
 * items for the same strain (e.g. different price/format) become its presentation options.
 * Selection stays fit-first (planBasket via buildBasketRoutes) — price never enters it.
 *
 * @param items merged decoded items: { known:{id,cat,terps}, match, price, format, name, packaging? }
 * @param ans   user profile: { reasons, cats, gramsByCategory, times|timing, experience }
 */
export function buildRoutesFromMenu(items = [], ans = {}) {
  const ctx = { experience: ans.experience, reasons: ans.reasons };
  const known = items.filter((it) => it.known && typeof it.match === 'number' && it.match > 0);

  const offersByStrain = {};
  const meta = {};
  const scored = [];
  const batches = [];
  const seen = new Set();

  for (const it of known) {
    const id = it.known.id;
    (offersByStrain[id] ||= []).push({ price: it.price ?? null, packaging: it.packaging ?? null, format: it.format ?? null });
    if (!seen.has(id)) {
      seen.add(id);
      batches.push(strainToBatch(it.known));
      scored.push({ productId: id, batchId: id, matchPct: it.match, confidence: 1, reasonHuman: '', topLayer: 'prior' });
      meta[id] = { name: it.name, why: buildWhy(it, ctx) };
    } else {
      const s = scored.find((x) => x.batchId === id);  // keep the strain's best match
      if (s && it.match > s.matchPct) s.matchPct = it.match;
    }
  }

  const need = buildNeedVector({
    reasons:         ans.reasons || [],
    cats:            ans.cats || [],
    gramsByCategory: ans.gramsByCategory || {},
    timing:          ans.times || ans.timing || [],
    experience:      ans.experience,
  });

  return buildBasketRoutes(need, scored, batches, { offersByStrain, meta, maxBags: 5 });
}
