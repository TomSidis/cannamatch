/**
 * File:            api/routes/menu.js
 * Responsibility:  Parse pharmacy menu input (text/URL/image) into structured,
 *                  scored product entities.  No LLM calls.  No Anthropic SDK.
 *                  Pipeine steps:
 *                    1. Input normalisation → raw text extraction
 *                    2. Local OCR text parser  (menuParser.js)
 *                    3. Batch DB fuzzy match  (strain_fuzzy_match SQL function)
 *                    4. Scoring engine        (bridgeScore from src/engine/legacyBridge.ts)
 *                    5. Clinical kill-switch  (clinicalCore.js — per-product)
 * Dependencies:    express, api/db.js, api/constants.js,
 *                  api/security/claudeProxyShield.js,
 *                  api/lib/menuParser.js, api/lib/ai-genetics-inference.js,
 *                  api/lib/normalization.js, api/lib/clinicalCore.js,
 *                  src/engine/legacyBridge.ts
 */

import { Router }                                        from 'express';
import { pool }                                          from '../db.js';
import { DEFAULT_DNA }                                   from '../constants.js';
import { verifySession }                                 from '../security/claudeProxyShield.js';
import { parseRawMenuText }                              from '../lib/menuParser.js';
import { fetchUnknownStrainGenetics }                    from '../lib/ai-genetics-inference.js';
import { resolveAmbiguity, normalizeProductEntry }       from '../lib/normalization.js';
import { bridgeScore }                                   from '../../src/engine/legacyBridge.ts';
import { LICENSED_CATEGORIES, DEFAULT_CATEGORY }        from '../../src/lib/categoryConfig.js';
import { verifyClinicalSafety }                          from '../lib/clinicalCore.js';
import { parseMenuImageFormatted }                        from '../lib/ocr.js';
import { assertSafeExternalUrl }                          from '../lib/ssrfGuard.js';

const router = Router();

const MAX_REDIRECTS      = 5;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2 MB — menu pages are never larger

// ── Shape adapters ────────────────────────────────────────────────────────────

function mapRowToScoringEngineStrain(row) {
  return {
    id:                 row.strain_id || row.id,
    name:               row.strain_name || row.name,
    cat:                row.category || DEFAULT_CATEGORY,
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
  const userCats = dna.categories && dna.categories.length > 0
    ? dna.categories
    : LICENSED_CATEGORIES;
  return {
    cats:         overrideCats || userCats,
    reasons:      dna.indications      || [],
    killSwitches: dna.blocked_triggers || [],
  };
}

// ── URL scraper ───────────────────────────────────────────────────────────────

async function scrapePharmacyMenuUrl(rawUrl) {
  // SSRF check on the initial URL (protocol + DNS resolution)
  try {
    await assertSafeExternalUrl(rawUrl);
  } catch (err) {
    throw new Error(`כתובת חסומה: ${err.message}`);
  }

  let currentUrl = rawUrl.trim();
  let redirectsFollowed = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 10_000);
    let r;
    try {
      r = await fetch(currentUrl, {
        signal:   ctrl.signal,
        redirect: 'manual', // follow manually so each hop is re-validated
        headers:  { 'User-Agent': 'Mozilla/5.0 (compatible; CannaMatch/1.0; +https://cannamatch.co)' },
      });
    } finally {
      clearTimeout(tid);
    }

    // Re-validate every redirect target before following
    if (r.status >= 300 && r.status < 400) {
      if (redirectsFollowed >= MAX_REDIRECTS) {
        throw new Error(`יותר מדי הפניות (max ${MAX_REDIRECTS})`);
      }
      const location = r.headers.get('location');
      if (!location) throw new Error('הפניה ללא כותרת Location');
      const nextUrl = new URL(location, currentUrl).href;
      try {
        await assertSafeExternalUrl(nextUrl);
      } catch (err) {
        throw new Error(`הפניה לכתובת חסומה: ${err.message}`);
      }
      currentUrl = nextUrl;
      redirectsFollowed++;
      continue;
    }

    if (!r.ok) throw new Error(`לא ניתן לטעון (${r.status})`);

    // Enforce response size limit before reading body
    const clHeader = r.headers.get('content-length');
    if (clHeader && parseInt(clHeader, 10) > MAX_RESPONSE_BYTES) {
      throw new Error(`תגובה גדולה מדי (${clHeader} bytes — max 2 MB)`);
    }

    const ct = r.headers.get('content-type') || '';
    if (ct.includes('pdf') || /\.pdf$/i.test(currentUrl)) {
      const buf = await r.arrayBuffer();
      if (buf.byteLength > MAX_RESPONSE_BYTES) {
        throw new Error(`PDF גדול מדי (${buf.byteLength} bytes — max 2 MB)`);
      }
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
          category:           DEFAULT_CATEGORY,
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

    // ── Step 4: score via Engine 2 ───────────────────────────────────────────
    const uniqueCats = [...new Set(allHits.map((r) => r.category).filter(Boolean))];
    const ans        = mapDnaToScoringAnswers(dna, uniqueCats.length ? uniqueCats : null);
    const ranked     = allHits
      .map(mapRowToScoringEngineStrain)
      .map(s => {
        const r = bridgeScore(s, ans);
        return { ...s, match: r.matchPct, confidence: r.confidence };
      })
      .sort((a, b) => b.match - a.match || b.confidence - a.confidence);

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

// ── POST /api/parse-menu-image — auth-gated OCR for pharmacy menu images/PDFs ─
// Accepts: { image_base64: string, media_type?: string }
// Returns: { text: string }  — formatted "Name T22/C4 — 280₪" lines
router.post('/parse-menu-image', verifySession, async (req, res) => {
  const { image_base64, media_type } = req.body;
  if (!image_base64 || typeof image_base64 !== 'string') {
    return res.status(400).json({ error: { message: 'חסר image_base64.' } });
  }
  try {
    const buffer = Buffer.from(image_base64, 'base64');
    const text   = await parseMenuImageFormatted(buffer, media_type || 'image/jpeg');
    return res.json({ text });
  } catch (err) {
    if (err.message.includes('ANTHROPIC_API_KEY')) {
      return res.status(503).json({ error: { message: 'OCR דורש ANTHROPIC_API_KEY — ראו README.' } });
    }
    console.error('[parse-menu-image]', err.message);
    return res.status(502).json({ error: { message: `שגיאה בעיבוד: ${err.message}` } });
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
