/**
 * seachParser.js — COA parser for Seach (שיח) manufacturer.
 * Source: https://seach.co.il/products/batches/
 *
 * COA format (verified against Shap-O / Donkey Ballz sample):
 *   HTML page, each batch in a card/table with:
 *   - Batch number (מספר אצווה / Lot No)
 *   - Strain name (Hebrew + English)
 *   - Genetics / lineage (הורים)
 *   - Terpene profile (% per terpene)
 *   - THC / CBD values (point value = measured)
 *   - Cultivation method (שיטת גידול)
 *   - Irradiation status
 *
 * FOUNDER: if Seach changes their site structure, update the regexes below.
 * The raw HTML is stored in grow_batch.raw_coa_text for re-parsing without re-fetching.
 */

/** Known terpene name aliases → canonical */
const TERPENE_MAP = {
  // English aliases
  myrcene: 'myrcene', 'β-myrcene': 'myrcene', 'b-myrcene': 'myrcene',
  limonene: 'limonene', 'd-limonene': 'limonene',
  caryophyllene: 'caryophyllene', 'β-caryophyllene': 'caryophyllene', 'b-caryophyllene': 'caryophyllene',
  linalool: 'linalool',
  pinene: 'pinene', 'α-pinene': 'pinene', 'a-pinene': 'pinene', 'β-pinene': 'pinene',
  terpinolene: 'terpinolene',
  humulene: 'humulene', 'α-humulene': 'humulene',
  ocimene: 'ocimene', 'β-ocimene': 'ocimene',
  // Hebrew
  'מירצן': 'myrcene', 'לימונן': 'limonene', 'קריופילן': 'caryophyllene',
  'לינלול': 'linalool', 'פינן': 'pinene', 'טרפינולן': 'terpinolene',
  'הומולן': 'humulene', 'אוצימן': 'ocimene',
};

function normalizeTerpene(raw) {
  const key = raw.trim().toLowerCase();
  return TERPENE_MAP[key] ?? null;
}

function parsePct(s) {
  if (!s) return null;
  const m = String(s).replace(',', '.').match(/[\d.]+/);
  return m ? parseFloat(m[0]) : null;
}

function parseCultivationMethod(raw) {
  const s = (raw || '').toLowerCase();
  if (/greenhouse|חממה/.test(s)) return 'greenhouse';
  if (/indoor|אינדור|פנים/.test(s)) return 'indoor';
  if (/outdoor|חוץ/.test(s)) return 'outdoor';
  if (/hybrid|היברידי/.test(s)) return 'hybrid_grow';
  return undefined;
}

/**
 * Parse an HTML page from seach.co.il/products/batches/
 * Returns an array of ParsedCOA objects (one per batch found).
 *
 * @param {string} html
 * @param {string} [sourceUrl]
 * @returns {{ batches: import('./types.js').ParsedCOA[], warnings: string[] }}
 */
export function parseSeachHTML(html, sourceUrl = '') {
  const batches = [];
  const warnings = [];

  if (!html || typeof html !== 'string') {
    return { batches: [], warnings: ['Empty or non-string HTML received'] };
  }

  // Split on batch-card boundaries — Seach uses divs with class "batch", "lot", "product-batch"
  // or a repetitive heading pattern.
  // Pattern: each batch starts with a lot/batch number heading.
  // Heuristic: split on lines containing lot/batch number patterns like "SH-YYYY-NNN", "SHA-NNN"
  const LOT_PATTERN = /(?:מספר אצווה|batch\s*(?:no|number|#)|lot\s*(?:no|number|#))[\s:]*([A-Z0-9\-]+)/gi;

  // Extract all batch blocks
  const blocks = splitIntoBlocks(html);

  for (const block of blocks) {
    try {
      const batch = parseSingleBlock(block, sourceUrl);
      if (batch && batch.batchNo) {
        batches.push(batch);
      }
    } catch (e) {
      warnings.push(`Block parse error: ${e.message}`);
    }
  }

  if (batches.length === 0) {
    // Try legacy single-batch page format
    const single = parseSingleBlock(html, sourceUrl);
    if (single?.batchNo) batches.push(single);
    else warnings.push('No batches found in HTML — Seach page format may have changed');
  }

  return { batches, warnings };
}

function splitIntoBlocks(html) {
  // Try to split on article/card boundaries; fallback to whole document as one block
  const articleSplit = html.split(/<\/article>|<\/div class="batch|<hr\s*\/?>/i);
  if (articleSplit.length > 1) return articleSplit;
  return [html]; // treat whole page as one block
}

function parseSingleBlock(html, sourceUrl) {
  // Convert block-level elements to newlines first so line-anchored regexes work
  const text = html
    .replace(/<\/?(?:p|h[1-6]|li|div|tr|article|section|br)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&times;/g, '×')
    .replace(/[ \t]{2,}/g, ' ')   // collapse inline whitespace only
    .replace(/\n{3,}/g, '\n\n');  // max 2 consecutive newlines

  // Batch number: must contain at least one digit (real lot numbers always do).
  // "קוד מוצר" (product code) accepted for per-product pages that have no lot number.
  const batchMatch = text.match(
    /(?:מספר אצווה|קוד מוצר|batch\s*(?:no\.?|number|#)|lot\s*(?:no\.?|#)?|product\s*code)\s*:?\s*([A-Z]{0,5}[\-]?\d[A-Z0-9\-]{0,18})/i,
  ) || text.match(/\b(SH[A-Z0-9\-]*\d[A-Z0-9\-]{0,}|LOT[A-Z0-9\-]*\d[A-Z0-9\-]{0,})\b/i);

  if (!batchMatch) return null;
  const batchNo = batchMatch[1].trim();

  // Genetics / strain name: capture to end of line
  const geneticsMatch = text.match(
    /(?:שם הזן|strain\s*name|genetics|זן)\s*:?\s*([^\n,;|]{3,80})/im,
  );
  const genetics = geneticsMatch?.[1]?.trim();

  // Parents: capture to end of line, then split on cross notation
  const parentsMatch = text.match(/(?:הורים|parents|lineage|cross)\s*:?\s*([^\n;|]{5,120})/im);
  const parentsRaw = parentsMatch?.[1]?.trim();
  const parents = parentsRaw
    ? parentsRaw.split(/[×xX]|\//).map(p => p.trim()).filter(Boolean)
    : [];

  // THC / CBD (point values = measured provenance)
  const thcMatch = text.match(/THC\s*:?\s*([\d.,]+)\s*%/i);
  const cbdMatch = text.match(/CBD\s*:?\s*([\d.,]+)\s*%/i);
  const thcPct = parsePct(thcMatch?.[1]);
  const cbdPct = parsePct(cbdMatch?.[1]);

  // Terpenes: look for "terpene_name: 0.XX%" or "terpene_name 0.XX%"
  const terpenes = {};
  // \s replaced by [ \t] so the name never spans across newlines
  // character class uses space/tab (not \s) so names never span newlines
  const terpeneRegex = /([א-תa-zA-Zα-βΑ-Ωα-ωβ][א-תa-zA-Z\- \tα-βΑ-Ωα-ω]{0,30}?)\s*:?\s*([\d.,]+)\s*%/g;
  let m;
  while ((m = terpeneRegex.exec(text)) !== null) {
    const canonical = normalizeTerpene(m[1]);
    if (canonical) {
      const pct = parsePct(m[2]);
      if (pct !== null && pct <= 5.0) { // sanity: terpene % typically < 5%
        terpenes[canonical] = pct;
      }
    }
  }

  // Cultivation method
  const cultivationMatch = text.match(
    /(?:שיטת גידול|cultivation|grow\s*method|method\s*of\s*cultivation)\s*:?\s*([^\n,;|]{3,30})/i,
  );
  const cultivationMethod = parseCultivationMethod(cultivationMatch?.[1]);

  // Irradiation
  const irradiationMatch = text.match(/(?:הקרנה|irradiat(?:ed|ion))\s*:?\s*(yes|no|כן|לא)/i);
  const irradiation = irradiationMatch
    ? /yes|כן/.test(irradiationMatch[1]) : undefined;

  // Grow season
  const seasonMatch = text.match(
    /(?:עונת גידול|grow\s*season|season)\s*:?\s*([^\n;|]{3,30})/i,
  );
  const growSeason = seasonMatch?.[1]?.trim();

  // Provenance: if THC is a point value and terpenes are present → measured
  const provenance = (thcPct !== null && Object.keys(terpenes).length > 0)
    ? 'measured' : 'declared';

  return {
    batchNo,
    sku: undefined,
    genetics,
    parents,
    cultivator: 'Seach',
    cultivationMethod,
    irradiation,
    growSeason,
    thcPct,
    cbdPct,
    terpenes,
    provenance,
    coaUrl: sourceUrl,
    rawText: text.slice(0, 2000), // keep first 2kB for audit
  };
}

// ── Known fixture: Tchelet product page (Seach / htmlPerProduct) ─────────────
// Product page format: strain info + terpenes BUT no per-batch THC point value.
// → provenance='declared' (catalog info, not a signed COA).
// Lineage: Shark's Breath × Skunk#1 (PROVE IT requirement).
export const TCHELET_PRODUCT_FIXTURE_HTML = `
<article class="product">
  <h2>שם הזן: Tchelet (תכלת)</h2>
  <p>קוד מוצר: TCH-2024-001</p>
  <p>הורים: Shark's Breath × Skunk#1</p>
  <p>שיטת גידול: Indoor</p>
  <h3>פרופיל טרפנים אופייני</h3>
  <ul>
    <li>Myrcene: 0.68%</li>
    <li>β-Caryophyllene: 0.45%</li>
    <li>Humulene: 0.29%</li>
    <li>Linalool: 0.22%</li>
  </ul>
  <p>לבדיקת תוצאות אצווה ספציפית ראו עמוד COA נפרד</p>
</article>
`;

// ── Known fixture: Shap-O / Donkey Ballz (Seach) ──────────────────────────────
// Verified: Blackberry Breath × Animal Crasher, indoor, measured terpenes.
// Used in tests when live site is not reachable.
export const SHAPO_FIXTURE_HTML = `
<article class="batch">
  <h2>שם הזן: Shap-O (Donkey Ballz)</h2>
  <p>מספר אצווה: SHA-2024-031</p>
  <p>הורים: Blackberry Breath × Animal Crasher</p>
  <p>THC: 22.4%</p>
  <p>CBD: 0.8%</p>
  <p>שיטת גידול: Indoor</p>
  <p>הקרנה: כן</p>
  <p>עונת גידול: Autumn 2024</p>
  <h3>פרופיל טרפנים</h3>
  <ul>
    <li>Limonene: 0.72%</li>
    <li>Linalool: 0.48%</li>
    <li>Myrcene: 0.41%</li>
    <li>α-Pinene: 0.31%</li>
    <li>β-Caryophyllene: 0.28%</li>
  </ul>
</article>
`;
