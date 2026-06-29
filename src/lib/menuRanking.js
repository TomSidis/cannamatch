/**
 * menuRanking — the MAIN ROUTE view over a merged scan session (Layer 5).
 *
 * Scoring itself stays in the engine (bridgeScore); this module only RANKS and
 * builds the per-row "why" for display. Pure + testable.
 *
 * Iron rules enforced here:
 *   - show ALL strains, sorted high→low; nothing hidden.
 *   - soft 70% line is VISUAL only (tier label), never a cutoff.
 *   - empty community → awaiting-data text, never a fabricated number.
 *   - NEVER a price field beside the match % (rows carry no price).
 */
import { TERPENES } from '../data/strainsConfig.js';

export const SOFT_LINE = 70;
export const AWAITING_TEXT = 'עוד אוספים דיווחים';

// chemovar from the T/C category (chemotype, never indica/sativa).
export function chemovarLabel(cat) {
  const m = (cat || '').match(/T(\d+)\/C(\d+)/i);
  if (!m) return null;
  const thc = +m[1], cbd = +m[2];
  const ratio = cbd > 0 ? thc / cbd : Infinity;
  if (ratio >= 3) return 'עתיר THC';
  if (ratio <= 0.33) return 'עתיר CBD';
  return 'מאוזן';
}

// Top-N dominant terpenes (Hebrew names) from a strain's terpene dict.
function topTerps(terps, n = 2) {
  return Object.entries(terps || {})
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => TERPENES[k]?.he || k);
}

function dominantTerpKey(terps) {
  const top = Object.entries(terps || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : null;
}

// Mirror of the engine's new-user route gate: first/little always; veteran only with anxiety.
export function routeActive(experience, reasons = []) {
  if (!experience) return false;
  return experience !== 'experienced' || (reasons || []).includes('anxiety');
}

const ANXIOLYTIC = new Set(['linalool', 'limonene']);

// Per-row why: chemovar + dominant terpenes + the anxiolytic reason WHEN the route applied.
export function buildWhy(item, { experience, reasons } = {}) {
  const parts = [];
  const chemo = chemovarLabel(item.cat);
  if (chemo) parts.push(chemo);

  const terps = item.known?.terps;
  const names = topTerps(terps, 2);
  if (names.length) parts.push(names.join(' + '));

  if (routeActive(experience, reasons) && terps) {
    const dom = dominantTerpKey(terps);
    if (dom === 'terpinolene') parts.push('הופחת — טרפינולן עלול להגביר חרדה בתחילת הדרך');
    else if (Object.keys(terps).some((t) => ANXIOLYTIC.has(t) && terps[t] > 0)) {
      parts.push('מועדף להתחלה רכה — נוטה להרגעה');
    }
  }

  return parts.join(' · ') || 'מבוסס על הפרופיל שלך';
}

// Community status — never fabricate a number. Awaiting until real reports exist.
export function communityStatus(item) {
  return item?.communityN > 0 ? null : AWAITING_TEXT;
}

/**
 * rankMenu — ranked rows for the main route. ALL items kept; sorted high→low by match%,
 * unknown / unscored last. Rows carry NO price (iron rule: no price beside match %).
 */
export function rankMenu(items = [], ctx = {}) {
  return items
    .map((it) => ({
      id:        it.known?.id ?? it.id ?? it.name,
      name:      it.name,
      matchPct:  typeof it.match === 'number' ? it.match : null,
      tier:      (typeof it.match === 'number' && it.match >= SOFT_LINE) ? 'high' : 'partial',
      isOil:     !!it.isOil,
      format:    it.format || null,
      cat:       it.cat || null,
      genetics:  it.genetics || null,
      known:     it.known || null,
      unknown:   !!it.unknown,
      inLicense: it.inLicense !== false,
      why:       buildWhy(it, ctx),
      community: communityStatus(it),
      // intentionally NO price field — never shown beside a match %.
    }))
    .sort((a, b) => {
      // scored first (desc), then unknown/unscored
      const am = a.matchPct, bm = b.matchPct;
      if (am === null && bm === null) return 0;
      if (am === null) return 1;
      if (bm === null) return -1;
      return bm - am;
    });
}
