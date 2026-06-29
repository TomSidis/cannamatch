/**
 * scanSession — a scan is a SESSION of ordered pages, not a single image (Layer 4.2).
 *
 * Pure, framework-free logic so it is unit-testable and survives a refresh via
 * save/load. Each page is decoded independently (reusing menuDecoder.decodeMenu)
 * and the session's strain set is the MERGE of all decoded pages, deduped on a
 * frontend canonical_key. Adding/removing a page re-merges without corrupting the set.
 *
 * Append never overwrites. No page cap, no blocking.
 */
import { decodeMenu } from './menuDecoder.js';

// ── normalize / canonical key (mirrors catalogParser.canonicalKey shape) ──────
function norm(s) {
  return (s || '').toLowerCase().replace(/['"`׳״.\-–—_]/g, '').replace(/\s+/g, ' ').trim();
}

// product_format detection from a raw menu line. 'גליליות' intentionally NOT a
// format (it doubles as a strain name) — same call the catalog parser makes.
export function detectFormat(line = '') {
  if (/שמן/.test(line)) return 'oil';
  if (/(קפסול|כמוס)/.test(line)) return 'capsule';
  if (/(פרירול|פרה.?רול|pre.?roll)/i.test(line)) return 'pre_roll';
  if (/(מיניז|מיני|סמול|\bmini\b)/i.test(line)) return 'small';
  return 'inflorescence';
}

// canonical_key = normalize(name) | format | normalize(grower). Same strain+format+grower
// → one key (merges across pages); distinct formats → distinct keys (stay separate items).
export function canonicalKeyFor(name, format, grower = 'unknown') {
  return `${norm(name)}|${format}|${norm(grower) || 'unknown'}`;
}

// FNV-1a 32-bit over byte-ish input (downscaled image bytes or its data-URL string).
// Identical normalized image → identical hash → exact-duplicate detection.
export function imageHash(input) {
  const bytes = typeof input === 'string'
    ? Array.from(input, (c) => c.charCodeAt(0))
    : Array.from(input || []);
  let h = 0x811c9dc5;
  for (const b of bytes) { h ^= (b & 0xff); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
}

// |A ∩ B| / min(|A|,|B|) — a subset page counts as a near-duplicate of its superset.
function overlapRatio(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const k of a) if (b.has(k)) inter++;
  return inter / Math.min(a.size, b.size);
}

export const NEAR_DUP_THRESHOLD = 0.85;
export const EXACT_DUP_MESSAGE  = 'נראה שכבר צילמת את הדף הזה';

let _pageCounter = 0;

export function createSession() {
  return { id: `sess_${Date.now()}`, pages: [], createdAt: Date.now() };
}

// Decode one page's raw text into canonical-keyed items. Reuses the existing decoder.
export function decodePageItems(rawText, ans = { cats: [] }, scored = []) {
  const decoded = decodeMenu(rawText || '', ans, scored);
  return decoded.map((d) => {
    const format = d.isOil ? 'oil' : detectFormat(d.origLine || d.name);
    const grower = d.grower || d.known?.grower || 'unknown';
    return { ...d, format, grower, canonicalKey: canonicalKeyFor(d.name, format, grower) };
  });
}

/**
 * addPage — append a decoded page. Append-only; never replaces an existing page.
 * @returns { ok, page?, duplicate? } where duplicate ∈ 'exact' | 'near' | null.
 *   exact  → identical image already in session; page NOT added (message provided).
 *   near   → page IS added but flagged nearDuplicateOf (UI asks keep/discard).
 */
export function addPage(session, { imageHash: hash = null, rawText = '', ans, scored } = {}) {
  if (hash != null && session.pages.some((p) => p.imageHash === hash)) {
    return { ok: false, duplicate: 'exact', message: EXACT_DUP_MESSAGE };
  }

  const page = {
    id: `pg_${++_pageCounter}_${Date.now()}`,
    status: 'decoding',
    imageHash: hash,
    rawText,
    items: [],
    reason: null,
    nearDuplicateOf: null,
  };
  session.pages.push(page);
  _decode(page, ans, scored);
  _flagNearDuplicate(session, page);

  return { ok: true, page, duplicate: page.nearDuplicateOf ? 'near' : null };
}

function _decode(page, ans, scored) {
  try {
    const items = decodePageItems(page.rawText, ans, scored);
    page.items = items;
    if (items.length) { page.status = 'decoded'; page.reason = null; }
    else              { page.status = 'failed';  page.reason = 'no_strains'; }
  } catch (e) {
    page.status = 'failed';
    page.reason = String(e?.message || e);
    page.items = [];
  }
}

function _flagNearDuplicate(session, page) {
  page.nearDuplicateOf = null;
  if (page.status !== 'decoded' || !page.items.length) return;
  const keys = new Set(page.items.map((i) => i.canonicalKey));
  for (const other of session.pages) {
    if (other === page || other.status !== 'decoded' || !other.items.length) continue;
    if (overlapRatio(keys, new Set(other.items.map((i) => i.canonicalKey))) >= NEAR_DUP_THRESHOLD) {
      page.nearDuplicateOf = other.id;
      break;
    }
  }
}

// Re-decode a single page (after a re-shoot or to retry a blurry/failed one) without
// touching the others. Pass new rawText to replace the page's text.
export function retryPage(session, pageId, { rawText, ans, scored } = {}) {
  const page = session.pages.find((p) => p.id === pageId);
  if (!page) return { ok: false };
  if (rawText != null) page.rawText = rawText;
  page.status = 'decoding';
  _decode(page, ans, scored);
  _flagNearDuplicate(session, page);
  return { ok: true, page };
}

// Remove a bad page; the merged set re-derives from the remaining pages.
export function removePage(session, pageId) {
  session.pages = session.pages.filter((p) => p.id !== pageId);
  return session;
}

// Reorder pages (thumbnail drag).
export function movePage(session, fromIdx, toIdx) {
  const n = session.pages.length;
  if (fromIdx < 0 || fromIdx >= n || toIdx < 0 || toIdx >= n) return session;
  const [p] = session.pages.splice(fromIdx, 1);
  session.pages.splice(toIdx, 0, p);
  return session;
}

/**
 * mergeSession — the session's strain set: union of all DECODED pages' items,
 * deduped on canonical_key (first occurrence wins). Same strain+format on two pages
 * → counted once; distinct formats of one strain → kept separate.
 */
export function mergeSession(session) {
  const seen = new Map();
  for (const p of session.pages) {
    if (p.status !== 'decoded') continue;
    for (const it of p.items) {
      if (!seen.has(it.canonicalKey)) seen.set(it.canonicalKey, it);
    }
  }
  return [...seen.values()];
}

// ── Persistence — survive a refresh / backgrounding mid-scan ──────────────────
const LS_KEY = 'cm_scan_session';

export function saveSession(session) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(session)); } catch { /* storage full / unavailable */ }
}
export function loadSession() {
  try { const r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : null; }
  catch { return null; }
}
export function clearSession() {
  try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
}
