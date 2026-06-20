/**
 * File:            api/lib/menuParser.js
 * Responsibility:  Parse raw, multi-language OCR text from pharmacy menus into
 *                  structured product entities.  Zero external API calls.
 *                  Zero LLM tokens.  100 % deterministic.
 * Dependencies:    fs (Node built-in), path (Node built-in),
 *                  api/db.js (PostgreSQL pool — optional enrichment),
 *                  api/lib/normalization.js (levenshteinDistance, resolveCanonicalName),
 *                  src/knowledge/israeli_products.json (in-memory catalog)
 */

import { readFileSync }                                  from 'fs';
import { fileURLToPath }                                 from 'url';
import { dirname, resolve }                              from 'path';
import { pool }                                          from '../db.js';
import { levenshteinDistance, resolveCanonicalName }     from './normalization.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const KNOWLEDGE  = resolve(__dirname, '../../src/knowledge');

// ── Knowledge-base loader (singleton, synchronous) ────────────────────────────
let _products = null;
function loadProducts() {
  if (!_products) {
    _products = JSON.parse(
      readFileSync(resolve(KNOWLEDGE, 'israeli_products.json'), 'utf8'),
    );
  }
  return _products;
}

// ── Compiled RegEx constants ──────────────────────────────────────────────────

// Israeli MOH T/C category format: T20/C4, T1/C22, T0/C26, …  (case-insensitive)
const RE_TC = /\bT(\d{1,2})\/C(\d{1,2})\b/gi;

// Price: ₪NNN  |  NNN₪  |  NNN שח  |  NNN ש"ח  |  NNN שקל(ים)
const RE_PRICE = /(?:₪\s*(\d{2,4})|(\d{2,4})\s*(?:₪|שח|ש[""]ח|שקל(?:ים)?))/g;

// Noise tokens stripped before name-candidate extraction
const RE_NOISE = new RegExp(
  [
    'T\\d{1,2}\\/C\\d{1,2}',                                   // T/C categories
    '₪\\s*\\d+|\\d+\\s*(?:₪|שח|ש["""]ח|שקל(?:ים)?)',          // prices
    '\\b(?:גרם|gr(?:am)?|mg|מ"ל|ml|%|' +
      'בסטוק|במלאי|אין\\s*במלאי|סוף\\s*מלאי|\\d{3,4})\\b',    // stock/weight noise
    '[|•·\\-–—,;/\\\\]+',                                       // separators
  ].join('|'),
  'gi',
);

// ── Fuzzy scoring (uses the shared levenshteinDistance from normalization.js) ─
function fuzzyScore(query, candidate) {
  const q = (query   || '').toLowerCase().trim();
  const c = (candidate || '').toLowerCase().trim();
  if (!q || !c) return 0;
  if (q === c)   return 1.0;
  // Substring containment bonus: "Gelato" inside "Gelato #33" should score high
  if (c.includes(q) || q.includes(c)) {
    return Math.min(0.90, 0.75 + 0.15 * (Math.min(q.length, c.length) / Math.max(q.length, c.length)));
  }
  return 1 - levenshteinDistance(q, c) / Math.max(q.length, c.length, 1);
}

// ── Hard disambiguation rules ─────────────────────────────────────────────────
// Evaluated BEFORE fuzzy matching.  Ordered most-specific → least-specific.
// These permanently resolve known Israeli market naming anomalies to canonical
// genetic_id values, satisfying the 3-Entity Model without any fuzzy ambiguity.
const DISAMBIGUATION = [
  // Wedding-family (common source of marketing confusion)
  { pattern: /\bwedding\s*ck\b/i,        geneticId: 'wedding-cake',       category: 'T22/C4' },
  { pattern: /\bwedding\s+cake\b/i,       geneticId: 'wedding-cake',       category: 'T22/C4' },
  { pattern: /\bwedding\s+crasher\b/i,    geneticId: 'wedding-crasher',    category: 'T22/C4' },
  { pattern: /\bwedding\s+k\b/i,          geneticId: 'wedding-crasher',    category: 'T22/C4' },
  // Dessert / Cookies family
  { pattern: /\bice\s+cream\s+cake\b|\bICC\b/, geneticId: 'ice-cream-cake', category: 'T20/C4' },
  { pattern: /\bgelato\s*(?:#?\s*33)?\b/i, geneticId: 'gelato-33',         category: 'T20/C4' },
  { pattern: /\bgirl\s+scout\s+cook(?:ies)?\b|\bGSC\b/i, geneticId: 'girl-scout-cookies', category: 'T20/C4' },
  { pattern: /\bGMO\b|\bgarlic\s+cookies?\b/i, geneticId: 'gmo-garlic-cookies', category: 'T22/C4' },
  { pattern: /\bcarbon\s+fiber\b|\bcarbo\b/i,  geneticId: 'carbon-fiber',  category: 'T22/C4' },
  // Purple / Kush family
  { pattern: /\bpurple\s+zkittl(?:ez|es)?\b|\bP&Z\b/i, geneticId: 'purple-zkittlez', category: 'T22/C4' },
  { pattern: /\bpurple\s+punch\b/i,       geneticId: 'purple-punch',       category: 'T20/C4' },
  { pattern: /\bgranddaddy\s+purple\b|\bGDP\b|\bgrand\s*daddy\s+purp/i, geneticId: 'granddaddy-purple', category: 'T20/C4' },
  { pattern: /\bog\s+kush\b/i,             geneticId: 'og-kush',            category: 'T20/C4' },
  // Gorilla / Diesel family
  { pattern: /\bgorilla\s+glue\b|\bGG4\b|\boriginal\s+glue\b/i, geneticId: 'gorilla-glue-4', category: 'T22/C4' },
  { pattern: /\bsour\s+diesel\b/i,         geneticId: 'sour-diesel',        category: 'T20/C4' },
  // Haze / Sativa family
  { pattern: /\bamnesia\s+haze\b/i,        geneticId: 'amnesia-haze',       category: 'T22/C4' },
  { pattern: /\bjack\s+herer\b/i,          geneticId: 'jack-herer',         category: 'T20/C4' },
  { pattern: /\bblue\s+dream\b/i,          geneticId: 'blue-dream',         category: 'T20/C4' },
  { pattern: /\bzkittl(?:ez|es)?\b/i,      geneticId: 'zkittlez',           category: 'T20/C4' },
  // Israeli-specific branded products (Tikun Olam)
  { pattern: /\beran\s+almog\b/i,          geneticId: 'granddaddy-purple',  category: 'T20/C4' },
  { pattern: /\bavidekel\b/i,              geneticId: 'acdc',               category: 'T1/C20'  },
  { pattern: /\bmidnight\b/i,              geneticId: 'northern-lights',    category: 'T15/C1'  },
  { pattern: /\bnorthern\s+lights\b/i,     geneticId: 'northern-lights',    category: 'T18/C4'  },
];

// ── In-memory fuzzy catalog ───────────────────────────────────────────────────
// Built once from the knowledge JSON; each entry: { name, geneticId, category }
let _catalog = null;

function buildCatalog() {
  const ip      = loadProducts();
  const entries = [];
  const seen    = new Set();

  function add(name, geneticId, category) {
    const key = `${(name || '').toLowerCase()}|${geneticId || ''}`;
    if (!name || name.trim().length < 2 || seen.has(key)) return;
    seen.add(key);
    entries.push({ name: name.trim(), geneticId: geneticId || null, category: category || null });
  }

  // 1. Genetic identity registry  →  display_name + aliases + Israeli commercial names
  for (const id of (ip.genetic_identity_registry?.identities || [])) {
    const regEntry = ip.commercial_product_registry?.products
      .find((p) => p.genetic_id === id.genetic_id);
    const cat = regEntry?.tc_category || null;

    add(id.display_name, id.genetic_id, cat);
    for (const alias of (id.aliases || []))  add(alias, id.genetic_id, cat);
    for (const cn    of (id.israeli_commercial_names || [])) {
      add(cn, id.genetic_id, cat);
      add(cn.replace(/\s*\([^)]*\)\s*/g, '').trim(), id.genetic_id, cat); // strip qualifiers
    }
  }

  // 2. Commercial product registry  →  exact commercial names and their normalised forms
  for (const p of (ip.commercial_product_registry?.products || [])) {
    add(p.commercial_name,      p.genetic_id, p.tc_category);
    add(p.commercial_name_norm, p.genetic_id, p.tc_category);
  }

  // 3. Cultivator product names  →  linked back to genetic registry where possible
  for (const cultivator of (ip.cultivators || [])) {
    for (const prod of (cultivator.products || [])) {
      const regEntry = ip.commercial_product_registry?.products
        .find((p) => p.commercial_name.toLowerCase() === prod.commercial_name?.toLowerCase());
      add(prod.commercial_name, regEntry?.genetic_id || null, prod.tc_category);
    }
  }

  // 4. Genetics-to-TC lineage names  →  canonical lineage strings
  for (const m of (ip.genetics_to_tc_guide?.mappings || [])) {
    if (m.lineage) add(m.lineage, null, m.typical_tc?.split('-')[0] || null);
  }

  return entries;
}

function getCatalog() {
  if (!_catalog) _catalog = buildCatalog();
  return _catalog;
}

// ── Optional DB enrichment (fires once, non-blocking) ────────────────────────
// Supplements the in-memory catalog with live strain names from PostgreSQL.
let _dbLoaded  = false;
const _dbEntries = [];

async function enrichFromDb() {
  if (_dbLoaded) return;
  _dbLoaded = true;
  try {
    const { rows } = await pool.query(
      `SELECT id::text AS gid, name, genetics, lineage
       FROM strains
       WHERE name IS NOT NULL
       LIMIT 2000`,
    );
    for (const r of rows) {
      if (r.name)    _dbEntries.push({ name: r.name,    geneticId: r.gid, category: null });
      if (r.lineage) _dbEntries.push({ name: r.lineage, geneticId: r.gid, category: null });
      if (r.genetics && r.genetics !== 'unknown')
        _dbEntries.push({ name: r.genetics, geneticId: r.gid, category: null });
    }
  } catch {
    // DB offline — in-memory catalog is sufficient
  }
}

// ── Best fuzzy match ──────────────────────────────────────────────────────────
function findBestMatch(query, threshold = 0.52) {
  if (!query || query.length < 2) return null;
  const catalog = [...getCatalog(), ..._dbEntries];
  let best = null, bestScore = 0;

  for (const entry of catalog) {
    const s = fuzzyScore(query, entry.name);
    if (s > bestScore) { bestScore = s; best = entry; }
  }

  return bestScore >= threshold ? { ...best, confidence: bestScore } : null;
}

// ── Line-level field extractors ───────────────────────────────────────────────
function extractCategory(line) {
  RE_TC.lastIndex = 0;
  const m = RE_TC.exec(line);
  return m ? `T${m[1]}/C${m[2]}` : null;
}

function extractPrice(line) {
  RE_PRICE.lastIndex = 0;
  const m = RE_PRICE.exec(line);
  if (!m) return null;
  const n = parseInt(m[1] ?? m[2], 10);
  return isNaN(n) ? null : n;
}

// Strip noise and normalise via normalization.js before fuzzy matching.
// This handles common OCR artefacts (0↔O), whitespace, and known aliases.
function extractNameCandidate(line) {
  const noisy = line.replace(RE_NOISE, ' ').replace(/\s{2,}/g, ' ').trim();
  const { canonical } = resolveCanonicalName(noisy);  // normalizes & resolves dict aliases
  return canonical;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * parseRawMenuText(rawText) → Promise<ParsedProduct[]>
 *
 * ParsedProduct: { rawLine: string, geneticId: string|null, category: string|null, price: number|null }
 *
 * Pipeline per line:
 *   1. Extract explicit T/C category and price via RegEx (always, independent of name)
 *   2. Run hard disambiguation rules (highest priority, no fuzzy ambiguity)
 *   3. If no hit: strip noise → normalise via resolveCanonicalName → Levenshtein fuzzy match
 *   4. (Background) enrich catalog from PostgreSQL strains table on first call
 */
async function parseRawMenuText(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];

  enrichFromDb().catch(() => {});   // fire-and-forget, never crashes caller

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 2);

  const results = [];

  for (const rawLine of lines) {
    const explicitCategory = extractCategory(rawLine);
    const price            = extractPrice(rawLine);

    // ── Disambiguation (pattern rules, no fuzzy) ──────────────────────────
    let geneticId    = null;
    let ruleCategory = null;

    for (const rule of DISAMBIGUATION) {
      if (rule.pattern.test(rawLine)) {
        geneticId    = rule.geneticId;
        ruleCategory = rule.category;
        break;
      }
    }

    // ── Fuzzy match (only when no disambiguation hit) ─────────────────────
    let matchCategory = null;
    if (!geneticId) {
      const candidate = extractNameCandidate(rawLine);
      if (candidate.length >= 2) {
        const match = findBestMatch(candidate);
        if (match) {
          geneticId     = match.geneticId;
          matchCategory = match.category;
        }
      }
    }

    results.push({
      rawLine,
      geneticId,
      category: explicitCategory || ruleCategory || matchCategory || null,
      price,
    });
  }

  return results;
}

// Named exports — keep helpers testable in isolation
export {
  parseRawMenuText,
  extractCategory,
  extractPrice,
  findBestMatch,
  fuzzyScore,
  buildCatalog,
};
