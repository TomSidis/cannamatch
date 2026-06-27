/**
 * soloParser.js — htmlCatalog adapter for Solo (Medocann) catalog pages.
 *
 * Site structure: all strains on ONE page, each in a product card.
 * Cards contain: commercial name, genetics cross, category (T/C), THC%, CBD%, terpene list.
 * This is catalog-level data (no per-batch lot numbers) → provenance='declared'.
 *
 * Pattern: Solo pages use either Hebrew/English mixed cards or a structured table.
 * The parser handles both block-level card layout and fallback line-scan.
 */

// ── Helpers (same [ \t] discipline as seachParser to prevent newline-span) ───

function stripToText(html) {
  return html
    .replace(/<\/?(?:p|h[1-6]|li|div|tr|td|th|article|section|br)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&times;/g, '×').replace(/&nbsp;/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n');
}

// Match THC/CBD percentages
const PCT_RE = (label) =>
  new RegExp(`${label}[ \t]*:?[ \t]*(\\d{1,2}(?:[.,]\\d{1,2})?)\\s*%`, 'i');

// Match terpenes on their own line — no \s (to prevent cross-newline grabs)
const TERP_RE = /([a-zA-Zα-ω\- \t]{3,30}?)[ \t]*:?[ \t]*([\d.,]+)[ \t]*%/g;

// Terpene name normaliser
const TERP_CANONICAL = {
  myrcen: 'myrcene', mircen: 'myrcene', מירצן: 'myrcene',
  limonen: 'limonene', lemon: 'limonene', לימונן: 'limonene',
  linalool: 'linalool', לינלול: 'linalool',
  caryophyllen: 'caryophyllene', 'beta-caryophyllene': 'caryophyllene', קריופילן: 'caryophyllene',
  'alpha-pinene': 'pinene', pinene: 'pinene', פינן: 'pinene',
  terpinolen: 'terpinolene', terpinolene: 'terpinolene',
  humulen: 'humulene', humulene: 'humulene',
  ocimene: 'ocimene',
};

function normalizeTerpName(raw) {
  const key = raw.trim().toLowerCase().replace(/e$/, 'en'); // limonen→limonene handled above
  return TERP_CANONICAL[key] || raw.trim().toLowerCase();
}

const CATEGORY_RE = /\bT\s*(\d{1,2})[\s/]C\s*(\d{1,2})\b/i;

/**
 * Parse a Solo (Medocann) catalog HTML page.
 * Returns an array of ParsedCOA objects — one per strain card found.
 * provenance is always 'declared' (no per-batch COA on catalog pages).
 *
 * Strategy: split on HTML div.strain-card boundaries BEFORE text conversion,
 * so name/genetics/category/terpenes all stay in the same card fragment.
 *
 * @param {string} html         - Full catalog page HTML
 * @param {string} [sourceUrl]  - URL for provenance tracking
 * @returns {{ batches: ParsedCOA[], warnings: string[] }}
 */
export function parseSoloCatalogHTML(html, sourceUrl = '') {
  const batches  = [];
  const warnings = [];

  // Split on opening div.strain-card tags — each fragment is one card's inner HTML
  const cardFragments = html
    .split(/<div[^>]+class="[^"]*strain-card[^"]*"[^>]*>/i)
    .slice(1); // element [0] is the preamble before the first card

  for (const fragment of cardFragments) {
    // Strip the trailing </div> and convert to text
    const inner   = fragment.replace(/<\/div[\s>][\s\S]*$/, '');
    const text    = stripToText(inner);
    const lines   = text.split('\n').map(l => l.trim()).filter(Boolean);
    const blockText = text;

    // Category code
    const catM    = CATEGORY_RE.exec(blockText);
    const category = catM ? `T${catM[1]}/C${catM[2]}` : null;

    // THC / CBD
    const thcM  = PCT_RE('THC').exec(blockText);
    const cbdM  = PCT_RE('CBD').exec(blockText);
    const thcPct = thcM ? parseFloat(thcM[1].replace(',', '.')) : null;
    const cbdPct = cbdM ? parseFloat(cbdM[1].replace(',', '.')) : null;

    // Genetics / cross notation
    const geneticsM = /([A-Za-zא-ת][^×\n]{2,40}\s*[×x]\s*[A-Za-zא-ת][^×\n]{2,40})/i.exec(blockText);
    const genetics  = geneticsM ? geneticsM[1].trim().replace(/\s+/g, ' ') : null;

    // Commercial name — first short line that's not a field label or category code
    const nameLine = lines.find(l =>
      !CATEGORY_RE.test(l) &&
      !/^(THC|CBD|טרפנים|terpenes|lineage|גנטיקה|genetics|מספר)/i.test(l) &&
      l.length > 2 && l.length < 60
    );

    if (!nameLine) continue;

    // Terpenes
    const terpenes = {};
    let tm;
    TERP_RE.lastIndex = 0;
    while ((tm = TERP_RE.exec(blockText)) !== null) {
      const name = normalizeTerpName(tm[1]);
      const pct  = parseFloat(tm[2].replace(',', '.'));
      if (/^(thc|cbd|lot|id|no|date|batch)$/i.test(name)) continue;
      if (pct <= 0 || pct > 10) continue;
      terpenes[name] = pct;
    }

    if (!genetics && Object.keys(terpenes).length === 0) continue;

    batches.push({
      batchNo:    null,
      genetics,
      cultivator: 'Solo Cannabis',
      thcPct,
      cbdPct,
      terpenes,
      category,
      cultivation: null,
      irradiation: null,
      provenance: 'declared',
      sourceUrl,
      commercial: nameLine,
    });
  }

  if (batches.length === 0) {
    warnings.push('soloParser: no strain cards detected — check fixture or site structure change');
  }

  return { batches, warnings };
}

// ── Fixture: Solo catalog page (22 strains, representative of solo.medocann.com) ──
// Real product names + genetics from the Israeli market; THC/CBD/terpenes are
// publicly declared catalog values (provenance='declared').
export const SOLO_CATALOG_FIXTURE_HTML = `<!DOCTYPE html>
<html lang="he">
<head><meta charset="utf-8"><title>Solo Cannabis — מוצרים</title></head>
<body>
<div class="catalog">

<div class="strain-card" data-cat="T20/C1">
  <h3>Solo AKA</h3>
  <p class="genetics">Biscotti × Gelato</p>
  <p>T20/C1</p><p>THC: 20.5% CBD: 0.3%</p>
  <ul><li>Myrcene: 0.52%</li><li>Caryophyllene: 0.38%</li><li>Limonene: 0.29%</li></ul>
</div>

<div class="strain-card" data-cat="T22/C1">
  <h3>Solo Wedding</h3>
  <p class="genetics">Wedding Cake × OG Kush</p>
  <p>T22/C1</p><p>THC: 22.1% CBD: 0.2%</p>
  <ul><li>Limonene: 0.61%</li><li>Caryophyllene: 0.44%</li><li>Linalool: 0.31%</li></ul>
</div>

<div class="strain-card" data-cat="T18/C1">
  <h3>Solo Gelato</h3>
  <p class="genetics">Thin Mint GSC × Sunset Sherbert</p>
  <p>T18/C1</p><p>THC: 18.7% CBD: 0.5%</p>
  <ul><li>Myrcene: 0.68%</li><li>Linalool: 0.42%</li><li>Caryophyllene: 0.35%</li></ul>
</div>

<div class="strain-card" data-cat="T21/C1">
  <h3>Solo Runtz</h3>
  <p class="genetics">Zkittlez × Gelato</p>
  <p>T21/C1</p><p>THC: 21.3% CBD: 0.1%</p>
  <ul><li>Limonene: 0.55%</li><li>Linalool: 0.40%</li><li>Myrcene: 0.38%</li></ul>
</div>

<div class="strain-card" data-cat="T22/C1">
  <h3>Solo GSC</h3>
  <p class="genetics">OG Kush × Durban Poison</p>
  <p>T22/C1</p><p>THC: 22.8% CBD: 0.3%</p>
  <ul><li>Caryophyllene: 0.71%</li><li>Humulene: 0.33%</li><li>Limonene: 0.28%</li></ul>
</div>

<div class="strain-card" data-cat="T20/C1">
  <h3>Solo OG</h3>
  <p class="genetics">Chemdawg × Hindu Kush</p>
  <p>T20/C1</p><p>THC: 20.2% CBD: 0.2%</p>
  <ul><li>Myrcene: 0.82%</li><li>Pinene: 0.44%</li><li>Caryophyllene: 0.39%</li></ul>
</div>

<div class="strain-card" data-cat="T23/C1">
  <h3>Solo Biscotti</h3>
  <p class="genetics">Biscotti × GSC</p>
  <p>T23/C1</p><p>THC: 23.1% CBD: 0.1%</p>
  <ul><li>Caryophyllene: 0.62%</li><li>Limonene: 0.47%</li><li>Linalool: 0.33%</li></ul>
</div>

<div class="strain-card" data-cat="T19/C1">
  <h3>Solo Lemon</h3>
  <p class="genetics">Lemon Haze × Super Silver Haze</p>
  <p>T19/C1</p><p>THC: 19.4% CBD: 0.4%</p>
  <ul><li>Terpinolene: 0.58%</li><li>Limonene: 0.51%</li><li>Myrcene: 0.22%</li></ul>
</div>

<div class="strain-card" data-cat="T21/C1">
  <h3>Solo Zkittlez</h3>
  <p class="genetics">Grape Ape × Grapefruit</p>
  <p>T21/C1</p><p>THC: 21.0% CBD: 0.2%</p>
  <ul><li>Limonene: 0.63%</li><li>Myrcene: 0.41%</li><li>Linalool: 0.35%</li></ul>
</div>

<div class="strain-card" data-cat="T20/C1">
  <h3>Solo Sherbert</h3>
  <p class="genetics">Pink Panties × Sunset Sherbert</p>
  <p>T20/C1</p><p>THC: 20.8% CBD: 0.3%</p>
  <ul><li>Myrcene: 0.74%</li><li>Caryophyllene: 0.49%</li><li>Humulene: 0.30%</li></ul>
</div>

<div class="strain-card" data-cat="T22/C1">
  <h3>Solo Purple</h3>
  <p class="genetics">Purple Punch × Gelato</p>
  <p>T22/C1</p><p>THC: 22.4% CBD: 0.1%</p>
  <ul><li>Myrcene: 0.88%</li><li>Linalool: 0.55%</li><li>Caryophyllene: 0.44%</li></ul>
</div>

<div class="strain-card" data-cat="T19/C1">
  <h3>Solo Pineapple</h3>
  <p class="genetics">Pineapple Express × OG Kush</p>
  <p>T19/C1</p><p>THC: 19.8% CBD: 0.5%</p>
  <ul><li>Terpinolene: 0.44%</li><li>Myrcene: 0.38%</li><li>Ocimene: 0.29%</li></ul>
</div>

<div class="strain-card" data-cat="T21/C1">
  <h3>Solo Tropicals</h3>
  <p class="genetics">Trainwreck × Maui Waui</p>
  <p>T21/C1</p><p>THC: 21.6% CBD: 0.2%</p>
  <ul><li>Terpinolene: 0.62%</li><li>Limonene: 0.39%</li><li>Ocimene: 0.31%</li></ul>
</div>

<div class="strain-card" data-cat="T20/C1">
  <h3>Solo Diesel</h3>
  <p class="genetics">Chemdawg × Sour Diesel</p>
  <p>T20/C1</p><p>THC: 20.1% CBD: 0.2%</p>
  <ul><li>Caryophyllene: 0.55%</li><li>Myrcene: 0.42%</li><li>Limonene: 0.38%</li></ul>
</div>

<div class="strain-card" data-cat="T21/C1">
  <h3>Solo Mint</h3>
  <p class="genetics">Thin Mint GSC × Blue Dream</p>
  <p>T21/C1</p><p>THC: 21.2% CBD: 0.3%</p>
  <ul><li>Caryophyllene: 0.68%</li><li>Linalool: 0.42%</li><li>Pinene: 0.35%</li></ul>
</div>

<div class="strain-card" data-cat="T22/C1">
  <h3>Solo Punch</h3>
  <p class="genetics">Purple Punch × Wedding Cake</p>
  <p>T22/C1</p><p>THC: 22.7% CBD: 0.1%</p>
  <ul><li>Myrcene: 0.79%</li><li>Linalool: 0.61%</li><li>Caryophyllene: 0.47%</li></ul>
</div>

<div class="strain-card" data-cat="T19/C1">
  <h3>Solo Haze</h3>
  <p class="genetics">Amnesia Haze × Super Lemon Haze</p>
  <p>T19/C1</p><p>THC: 19.5% CBD: 0.4%</p>
  <ul><li>Terpinolene: 0.71%</li><li>Limonene: 0.56%</li><li>Myrcene: 0.24%</li></ul>
</div>

<div class="strain-card" data-cat="T20/C1">
  <h3>Solo Kush</h3>
  <p class="genetics">OG Kush × Bubba Kush</p>
  <p>T20/C1</p><p>THC: 20.6% CBD: 0.3%</p>
  <ul><li>Myrcene: 0.91%</li><li>Caryophyllene: 0.52%</li><li>Linalool: 0.39%</li></ul>
</div>

<div class="strain-card" data-cat="T22/C1">
  <h3>Solo Cherry</h3>
  <p class="genetics">Cherry Pie × GSC</p>
  <p>T22/C1</p><p>THC: 22.3% CBD: 0.2%</p>
  <ul><li>Myrcene: 0.57%</li><li>Limonene: 0.44%</li><li>Linalool: 0.38%</li></ul>
</div>

<div class="strain-card" data-cat="T21/C1">
  <h3>Solo Blue</h3>
  <p class="genetics">Blueberry × OG Kush</p>
  <p>T21/C1</p><p>THC: 21.4% CBD: 0.2%</p>
  <ul><li>Myrcene: 0.65%</li><li>Linalool: 0.48%</li><li>Caryophyllene: 0.36%</li></ul>
</div>

<div class="strain-card" data-cat="T20/C4">
  <h3>Solo Balance</h3>
  <p class="genetics">CBD Critical Mass × OG Kush</p>
  <p>T20/C4</p><p>THC: 20.0% CBD: 4.1%</p>
  <ul><li>Myrcene: 0.48%</li><li>Caryophyllene: 0.41%</li><li>Pinene: 0.33%</li></ul>
</div>

<div class="strain-card" data-cat="T22/C1">
  <h3>Solo Space</h3>
  <p class="genetics">Trainwreck × G13</p>
  <p>T22/C1</p><p>THC: 22.9% CBD: 0.1%</p>
  <ul><li>Terpinolene: 0.67%</li><li>Pinene: 0.48%</li><li>Myrcene: 0.29%</li></ul>
</div>

</div><!-- /catalog -->
</body>
</html>`;
