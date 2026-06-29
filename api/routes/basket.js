/**
 * basket.js — POST /api/basket/plan
 *
 * Builds a purchase plan from DB batches for a given track (day/night/balanced).
 * Respects the full trust ladder: measured > declared > inferred confidence.
 * Honest scarcity: returns actual bag count; never inflates an empty plan.
 *
 * DEFERRED: hard quota enforcement (§09 — blocking recommendations that exceed
 * the monthly gram allowance). Planning layer is sufficient for launch.
 */

import { Router } from 'express';
import { pool }    from '../db.js';
import { verifySession } from '../security/claudeProxyShield.js';
import { bridgeScore }   from '../../src/engine/legacyBridge.ts';
import { buildNeedVector } from '../../src/engine/vectorMath.ts';
import { planBasket }    from '../../src/engine/basketPlanner.ts';
import { buildBasketRoutes } from '../../src/lib/basketRoutes.js';
import { DEFAULT_DNA }   from '../constants.js';

const router = Router();

// Track → time-of-day lean (drives UserNeed.times — NOT indica/sativa labeling).
const TRACK_TIMING = {
  day:      ['morning', 'afternoon'],
  night:    ['evening', 'night'],
  balanced: ['morning', 'afternoon', 'evening', 'night'],
};

// ── POST /api/basket/plan ─────────────────────────────────────────────────────
router.post('/basket/plan', verifySession, async (req, res) => {
  const { track = 'balanced', gramsByCategory } = req.body;

  if (!TRACK_TIMING[track]) {
    return res.status(400).json({ error: { message: 'track חייב להיות day | night | balanced' } });
  }

  try {
    // 1. Fetch user DNA
    const { rows: [profRow] } = await pool.query(
      `SELECT profile FROM user_dna_profiles WHERE user_id = $1`, [req.userId],
    );
    const dna = profRow?.profile ?? DEFAULT_DNA;

    // 2. Fetch batches from DB
    const { rows: strains } = await pool.query(
      `SELECT s.id, s.name, s.terpene_dist,
              b.category, b.price, b.in_stock,
              ph.name AS pharmacy_name
       FROM strains s
       LEFT JOIN LATERAL (
         SELECT category, price, in_stock, pharmacy_id
         FROM batches
         WHERE strain_id = s.id AND in_stock = TRUE
         ORDER BY price ASC LIMIT 1
       ) b ON TRUE
       LEFT JOIN pharmacies ph ON ph.id = b.pharmacy_id
       WHERE b.category IS NOT NULL
       LIMIT 200`,
    );

    // 3. Merge gramsByCategory: request body overrides DNA profile
    const mergedGrams = {
      ...(dna.gramsByCategory || {}),
      ...(gramsByCategory    || {}),
    };

    // 4. Build UserNeed with track timing
    const ans = {
      cats:           dna.categories       || [],
      reasons:        dna.indications      || [],
      killSwitches:   dna.blocked_triggers || [],
      gramsByCategory: mergedGrams,
    };
    const need = buildNeedVector({
      ...ans,
      timing: TRACK_TIMING[track],
    });

    // 5. Score + map to legacy bridge format
    const legacyStrains = strains.map(s => ({
      id:    s.id,
      cat:   s.category ?? 'T22/C4',
      terps: s.terpene_dist ?? {},
    }));

    const scored = legacyStrains
      .map(s => {
        const r = bridgeScore(s, ans);
        return {
          productId:   s.id,
          batchId:     s.id,
          matchPct:    r.matchPct,
          confidence:  r.confidence,
          reasonHuman: r.reasonHuman,
          topLayer:    r.topLayer,
        };
      })
      .filter(s => s.matchPct > 0);

    // 6. Build Batch objects for diversity check inside planBasket
    const batches = strains.map(s => {
      const catM = (s.category ?? 'T18/C3').match(/T(\d+)\/C(\d+)/i);
      return {
        id:         s.id,
        productId:  s.id,
        thcPct:     catM ? parseInt(catM[1]) : 18,
        cbdPct:     catM ? parseInt(catM[2]) : 3,
        terpenes:   Object.entries(s.terpene_dist ?? {}).map(([t, p]) => ({ terpene: t, pct: p })),
        provenance: Object.keys(s.terpene_dist ?? {}).length > 0 ? 'declared' : 'inferred',
        category:   s.category ?? 'T22/C4',
      };
    });

    // 7. Plan
    const plan = planBasket(need, scored, batches, { maxBags: 3 });

    // 8. Enrich bags with display info
    const strainMap = Object.fromEntries(strains.map(s => [s.id, s]));
    const scoreMap  = Object.fromEntries(scored.map(s => [s.batchId, s]));

    const bags = plan.bags.map(bag => {
      const s = strainMap[bag.batchId] ?? {};
      const r = scoreMap[bag.batchId]  ?? {};
      return {
        batchId:      bag.batchId,
        name:         s.name        ?? bag.batchId,
        pharmacyName: s.pharmacy_name ?? null,
        price:        s.price        ?? null,
        inStock:      s.in_stock     ?? false,
        category:     bag.category,
        grams:        bag.grams,
        role:         bag.role,
        matchPct:     bag.matchPct,
        confidence:   r.confidence  ?? 0,
        topLayer:     r.topLayer    ?? 'prior',
        reasonHuman:  r.reasonHuman ?? '',
      };
    });

    // Two routes (יקר / זול) — same fit-first selection, differ only by presentation.
    // DB path has one offer per strain (its cheapest batch); the client can post richer
    // scan-session offers. Either way both routes are returned.
    const offersByStrain = {};
    const routeMeta = {};
    for (const s of strains) {
      (offersByStrain[s.id] ||= []).push({ price: s.price ?? null, packaging: null, format: null });
      routeMeta[s.id] = { name: s.name ?? s.id, why: scoreMap[s.id]?.reasonHuman ?? '' };
    }
    const routes = buildBasketRoutes(need, scored, batches, { offersByStrain, meta: routeMeta, maxBags: 3 });

    res.json({
      track,
      bagCount:  bags.length,
      bags,                       // backward-compatible single plan (enriched)
      expensive: routes.expensive,
      cheap:     routes.cheap,
      coverage:  plan.coverage,
      warnings:  plan.warnings,
    });
  } catch (err) {
    console.error('basket/plan error:', err);
    res.status(500).json({ error: { message: 'שגיאת שרת בתכנון הקנייה' } });
  }
});

export default router;
