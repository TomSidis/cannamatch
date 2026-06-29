/**
 * cannabizScraper.js — Scrapes Cannabiz (and Easy Cannabis) for commercial
 * strain names entering the Israeli market.
 *
 * No extra deps — regex on raw HTML. Structure validated against Cannabiz WP/
 * WooCommerce as of 2026-06. If layout changes, update PRODUCT_NAME_RE.
 *
 * Each source has an isolated parser so one failure never aborts others.
 */

import { isPlausibleProductName } from '../../src/lib/menuDecoder.js';

const FETCH_TIMEOUT_MS = 12_000;
const UA = 'CannaMatch-CatalogBot/1.0 (medical-cannabis patient tool; contact: admin@cannamatch.co.il)';

// ── Fetch with timeout ─────────────────────────────────────────────────────────
async function safeFetch(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'he,en;q=0.8',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.text();
}

// ── Generic WooCommerce product-title extractor ────────────────────────────────
// Matches:
//   <h2 class="woocommerce-loop-product__title">NAME</h2>
//   <h2 class="...woocommerce...">NAME</h2>
//   <a class="...product_title...">NAME</a>
//   <span class="product-title">NAME</span>
//   <h3 class="entry-title"><a href="...">NAME</a></h3>  (some WP themes)
const PRODUCT_NAME_RE = /<(?:h[23]|span|a)[^>]*(?:woocommerce-loop-product__title|product[_-]title|entry-title)[^>]*>\s*(?:<a[^>]*>\s*)?([^<]{4,120}?)(?:\s*<\/a>)?\s*<\/(?:h[23]|span|a)>/gi;

// JSON-LD product schema (WooCommerce often includes this):
const JSONLD_NAME_RE = /"name"\s*:\s*"([^"]{4,120})"/g;

function extractNamesFromHtml(html) {
  const names = new Set();

  // 1. HTML tag patterns
  let m;
  const reTag = new RegExp(PRODUCT_NAME_RE.source, 'gi');
  while ((m = reTag.exec(html)) !== null) {
    const name = m[1].replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&quot;/g, '"').trim();
    if (name) names.add(name);
  }

  // 2. JSON-LD (more reliable when present)
  const reJson = new RegExp(JSONLD_NAME_RE.source, 'g');
  // Only look inside <script type="application/ld+json"> blocks
  const ldBlocks = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const block of ldBlocks) {
    while ((m = reJson.exec(block)) !== null) {
      const name = m[1].trim();
      if (name && !name.startsWith('http') && name.length >= 4) names.add(name);
    }
  }

  return [...names];
}

// ── Cannabiz new-strains page ──────────────────────────────────────────────────
export async function scrapeCannabizNew(url) {
  const html = await safeFetch(url);
  const raw  = extractNamesFromHtml(html);
  return raw.filter(n => isPlausibleProductName(n, null));
}

// ── Cannabiz full catalog (paginated) ─────────────────────────────────────────
// Cannabiz WooCommerce uses ?paged=N. Cap at 5 pages to stay polite.
export async function scrapeCannabizCatalog(baseUrl, maxPages = 5) {
  const names = new Set();
  for (let page = 1; page <= maxPages; page++) {
    const url = page === 1 ? baseUrl : `${baseUrl}page/${page}/`;
    try {
      const html = await safeFetch(url);
      const found = extractNamesFromHtml(html).filter(n => isPlausibleProductName(n, null));
      if (found.length === 0) break; // empty page = end of catalog
      found.forEach(n => names.add(n));
      // Polite delay between pages
      if (page < maxPages) await new Promise(r => setTimeout(r, 1200));
    } catch (err) {
      console.warn(`[cannabiz-catalog] page ${page} failed: ${err.message}`);
      break;
    }
  }
  return [...names];
}

// ── Easy Cannabis product listing ─────────────────────────────────────────────
// EasyCannabis loads products via a JSON endpoint or React SSR. Try both.
export async function scrapeEasyCannabis(url) {
  try {
    const html = await safeFetch(url);

    // EasyCannabis often exposes a __NEXT_DATA__ or window.__data__ JSON blob
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (nextDataMatch) {
      try {
        const data = JSON.parse(nextDataMatch[1]);
        // Walk the props tree looking for product arrays
        const json = JSON.stringify(data);
        const names = [];
        // Match "name":"Hebrew or Latin strain name"
        const nameRe = /"(?:title|name|productName)"\s*:\s*"([א-תa-zA-Z][^"]{3,80})"/g;
        let m;
        while ((m = nameRe.exec(json)) !== null) {
          if (isPlausibleProductName(m[1], null)) names.push(m[1]);
        }
        if (names.length > 0) return [...new Set(names)];
      } catch {}
    }

    // Fallback: HTML tag scrape
    return extractNamesFromHtml(html).filter(n => isPlausibleProductName(n, null));
  } catch (err) {
    throw new Error(`EasyCannabis scrape failed: ${err.message}`);
  }
}

// ── Grower / marketer extraction helpers ──────────────────────────────────────
// Known Israeli growers and marketers (from spec Section C).
const KNOWN_GROWERS = [
  'שיח', 'טוגדר', 'טריכום', 'בטר', 'פארמוקן', 'תיקון עולם', 'טבע אדיר',
  'קנדוק', 'קנאשור', 'קנערבה', 'בזלת', 'IMC', 'דוד וגוליית', 'גרינמד',
];
const KNOWN_MARKETERS = ['קנדוק', 'פנאקסיה', 'יוניבו', 'רפא', 'קרונוס ישראל', 'IMC'];
const KNOWN_BRANDS    = ['טוטם', 'ניצן', 'פיס נטורלס'];

/**
 * Best-effort extraction of grower/marketer/brand from surrounding HTML text.
 * Returns { grower, marketer, brand } — any may be null.
 */
export function extractProvenance(context = '') {
  const find = (list) => list.find(k => context.includes(k)) ?? null;
  return {
    grower:   find(KNOWN_GROWERS),
    marketer: find(KNOWN_MARKETERS),
    brand:    find(KNOWN_BRANDS),
  };
}
