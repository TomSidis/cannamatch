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

// Pick the presentation for one selected strain from its available menu offers.
//   offers: [{ price, packaging?: 'box'|'bag', format? }]
function chooseOffer(offers, mode) {
  if (!Array.isArray(offers) || offers.length === 0) return null;
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

  const expensive = plan.bags.map((b) => toRouteBag(b, 'expensive', offersByStrain, meta));
  const cheap     = plan.bags.map((b) => toRouteBag(b, 'cheap', offersByStrain, meta));

  return {
    expensive: { bags: expensive, coverage: plan.coverage, warnings: plan.warnings },
    cheap:     { bags: cheap,     coverage: plan.coverage, warnings: plan.warnings },
    coverage:  plan.coverage,
    warnings:  plan.warnings,
  };
}
