/**
 * File:            api/routes/menu.js
 * Responsibility:  Parse pharmacy menu input (text/URL/image) into structured,
 *                  scored product entities.  No LLM calls.  No Anthropic SDK.
 *                  Pipeine steps:
 *                    1. Input normalisation → raw text extraction
 *                    2. Local OCR text parser  (menuParser.js)
 *                    3. Batch DB fuzzy match  (strain_fuzzy_match SQL function)
 *                    4. Scoring engine        (scoreAll from src/lib/scoringEngine.js)
 *                    5. Clinical kill-switch  (clinicalCore.js — per-product)
 * Dependencies:    express, api/db.js, api/constants.js,
 *                  api/security/claudeProxyShield.js,
 *                  api/lib/menuParser.js, api/lib/ai-genetics-inference.js,
 *                  api/lib/normalization.js, api/lib/scoring.js,
 *                  api/lib/clinicalCore.js,
 *                  src/lib/scoringEngine.js, src/data/strainsConfig.js
 */

import { Router }                                        from 'express';
import { pool }                                          from '../db.js';
import { DEFAULT_DNA }                                   from '../constants.js';
import { verifySession }                                 from '../security/claudeProxyShield.js';
import { parseRawMenuText }                              from '../lib/menuParser.js';
import { fetchUnknownStrainGenetics }                    from '../lib/ai-genetics-inference.js';
import { resolveAmbiguity, normalizeProductEntry }       from '../lib/normalization.js';
import { calculateMatchScoreWithExplanation }            from '../lib/scoring.js';
import { scoreAll }                                      from '../../src/lib/scoringEngine.js';
import { TERPENES, REASONS }                             from '../../src/data/strainsConfig.js';
import { verifyClinicalSafety }                          from '../lib/clinicalCore.js';

const router = Router();

// ── Shape adapters ────────────────────────────────────────────────────────────

function mapRowToScoringEngineStrain(row) {
  return {
    id:                 row.strain_id || row.id,
    name:               row.strain_name || row.name,
    cat:                row.category || 'T22/C4',
    terps:              row.terpene_dist || {},
    effects:            row.target_indications || [],
    type:               row.product_type || 'flower',
    genetics:           row.genetics,
    lineage:            row.lineage,
    genetic_confidence: row.genetic_confidence,
    embedding:          row.embedding || null,
  };
}

function mapDnaToScoringAnswers(dna, overrideCats = null) {
  return {
    cats:      overrideCats || ['T22/C4','T20/C4','T18/C3','T15/C3','T12/C12','T10/C10','T10/C2','T3/C15','T3/C12'],
    reasons:   dna.indications || [],
    flavors:   Object.keys(dna.target_terpenes || {}),
    helped: [], notHelped: [], current: [],
  };
}

// ── URL scraper ───────────────────────────────────────────────────────────────

async function scrapePharmacyMenuUrl(url) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), 10_000);
  let r;
  try {
    r = await fetch(url.trim(), {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CannaMatch/1.0; +https://cannamatch.co)' },
    });
  } finally {
    clearTimeout(tid);
  }
  if (!r.ok) throw new Error(`לא ניתן לטעון (${r.status})`);
  const ct = r.headers.get('content-type') || '';
  if (ct.includes('pdf') || /\.pdf$/i.test(url)) {
    const buf = await r.arrayBuffer();
    return { type: 'pdf', base64: Buffer.from(buf).toString('base64'), media_type: 'application/pdf' };
  }
  const html = await r.text();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 5000);
  return { type: 'text', text };
}

// ── POST /api/parse-menu ──────────────────────────────────────────────────────
// Accepts: { text?, url?, image_base64?, user_id? }
// Returns: { count: number, products: ScoredProduct[] }
router.post('/parse-menu', verifySession, async (req, res) => {
  const { image_base64, text, url, user_id } = req.body;
  let names = [];

  // ── Step 1: normalise input → plain-text product lines ───────────────────
  try {
    if (text) {
      const parsed = await parseRawMenuText(text);
      names = parsed.length
        ? parsed.map((p) => p.rawLine).filter(Boolean)
        : text.split('\n').map((s) => s.trim()).filter(Boolean);
    } else if (url) {
      const scraped = await scrapePharmacyMenuUrl(url);
      if (scraped.type === 'pdf') {
        return res.status(422).json({
          error: {
            message:
              'פיענוח PDF מקומי מצריך Tesseract OCR. ' +
              'הדבק את הטקסט מהתפריט ישירות בשדה \'text\' כדי להשתמש בפרסר המקומי.',
          },
        });
      }
      const rawText = scraped.text || '';
      const parsed  = await parseRawMenuText(rawText);
      names = parsed.length
        ? parsed.map((p) => p.rawLine).filter(Boolean)
        : rawText.split(/\n|,|·|\|/).map((s) => s.trim()).filter((s) => s.length >= 2);
    } else if (image_base64) {
      return res.status(422).json({
        error: {
          message:
            'פיענוח תמונות מקומי מצריך Tesseract OCR שאינו מוגדר כרגע. ' +
            'הפעל Tesseract מחוץ לשרת והעבר את הטקסט שלו לשדה \'text\'.',
        },
      });
    } else {
      return res.status(400).json({ error: { message: 'צריך image_base64, url או text' } });
    }
  } catch (err) {
    console.error('parse-menu extraction error:', err.message);
    return res.status(502).json({ error: { message: `שגיאה בחילוץ התפריט: ${err.message}` } });
  }

  if (!names.length) {
    return res.json({ count: 0, products: [] });
  }

  try {
    // ── Step 2: load user DNA profile ──────────────────────────────────────
    const { rows: [profRow] } = await pool.query(
      `SELECT profile FROM user_dna_profiles WHERE user_id = $1`,
      [user_id ?? null],
    );
    const dna = profRow?.profile || DEFAULT_DNA;

    // ── Step 3: batch fuzzy match via SQL function (single DB round-trip) ───
    const { rows: matched } = await pool.query(
      `SELECT * FROM strain_fuzzy_match($1, 0.20)`,
      [names],
    );

    const commercialMap = new Map(matched.map((r) => [r.commercial, r]));

    // For names with no DB hit, attempt local genetics inference
    const unmatched = names.filter((n) => !commercialMap.has(n));
    await Promise.all(unmatched.map(async (name) => {
      const inferred = await fetchUnknownStrainGenetics(name).catch(() => null);
      if (inferred) {
        commercialMap.set(name, {
          commercial:         name,
          strain_id:          null,
          strain_name:        inferred.name || name,
          genetics:           inferred.genetics,
          lineage:            inferred.lineage,
          kind:               inferred.kind,
          category:           'T22/C4',
          terpene_dist:       {},
          target_indications: [],
          embedding:          null,
          sim_score:          0.4,
          ai_inferred:        true,
        });
      }
    }));

    const allHits = [...commercialMap.values()];
    if (!allHits.length) {
      return res.json({
        count: 0,
        products: names.map((n) => ({ commercial: n, matched: false, match: null })),
      });
    }

    // ── Step 4: score via unified scoring engine ─────────────────────────────
    const uniqueCats = [...new Set(allHits.map((r) => r.category).filter(Boolean))];
    const ans        = mapDnaToScoringAnswers(dna, uniqueCats.length ? uniqueCats : null);
    const ranked     = scoreAll(
      ans,
      {},
      { strains: allHits.map(mapRowToScoringEngineStrain), terpenes: TERPENES, reasons: REASONS },
    );

    const products = ranked.map((s) => {
      const hit = commercialMap.get(s.name)
               ?? [...commercialMap.values()].find((r) => r.strain_id === s.id);
      return {
        commercial:  hit?.commercial || s.name,
        strain_id:   s.id,
        genetics:    s.genetics,
        lineage:     s.lineage,
        embedding:   hit?.embedding ?? null,
        matched:     true,
        match:       s.match,
        category:    s.cat,
        confidence:  s.genetic_confidence || 'unverified',
        ai_inferred: hit?.ai_inferred ?? false,
        sim_score:   hit?.sim_score ?? null,
      };
    });

    // Append unmatched names so the client knows which lines had no DB hit
    const matchedCommercials = new Set(products.map((p) => p.commercial));
    for (const n of names) {
      if (!matchedCommercials.has(n)) {
        products.push({ commercial: n, matched: false, match: null });
      }
    }

    // ── Step 5: clinical kill-switch — per-product terpene safety gate ──────
    // verifyClinicalSafety uses the terpene embedding vector to detect
    // clinically dangerous combinations for the user's specific indications
    // (e.g. pinene ≥ 15 % for PTSD, terpinolene ≥ 20 % for anxiety).
    // Unsafe products have their match score zeroed and receive a Hebrew
    // medical companion message rather than a numeric recommendation.
    const finalProducts = products.map((p) => {
      if (!p.matched || !p.embedding || !dna.indications?.length) return p;

      let safety;
      try {
        safety = verifyClinicalSafety(
          { embedding: p.embedding, lineage: p.lineage || '', category: p.category || '' },
          dna,
        );
      } catch (err) {
        console.error('parse-menu kill-switch error for', p.commercial, ':', err.message);
        return p;
      }

      if (!safety.safe) {
        return {
          ...p,
          match:            safety.score_override ?? 0,
          clinical_warning: safety.companion_message,
          clinical_flag:    safety.flag,
          embedding:        undefined,   // strip raw embedding from response
        };
      }
      return { ...p, embedding: undefined };
    });

    res.json({
      count:    finalProducts.filter((p) => p.matched && !p.clinical_warning).length,
      products: finalProducts,
    });
  } catch (err) {
    console.warn('parse-menu: DB not available, returning names only —', err.message);
    res.json({
      count:      names.length,
      db_offline: true,
      products:   names.map((n) => ({ commercial: n, matched: false, match: null })),
    });
  }
});

// ── POST /api/fetch-menu — raw URL scrape (used by frontend preview) ─────────
router.post('/fetch-menu', async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: { message: 'חסר URL' } });
  }
  try {
    res.json(await scrapePharmacyMenuUrl(url));
  } catch (err) {
    res.status(502).json({ error: { message: err.message || 'לא ניתן לטעון את הכתובת' } });
  }
});

export default router;
