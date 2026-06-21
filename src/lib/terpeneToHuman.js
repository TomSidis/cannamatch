// ─────────────────────────────────────────────────────────────────────────────
//  terpeneToHuman.js — The single translation layer between chemical terpene
//  identifiers and warm, human-language descriptions.
//
//  RULE: Nothing above this layer ever reaches the user interface.
//  The user sees "מרגיע את הגוף · טוב לערב", never "myrcene".
//
//  Import this file anywhere you need to display terpene data.
// ─────────────────────────────────────────────────────────────────────────────

export const TERPENE_HUMAN = {
  myrcene: {
    label:       'מרגיע את הגוף',
    sub:         'טוב לערב ולשינה',
    strand:      'גוף רגוע בלילה',
    icon:        '🌙',
    dayLean:     'evening',
    color:       '#A78BFA',
    shortLabel:  'מרגיע גוף',
  },
  limonene: {
    label:       'מרים את הראש',
    sub:         'מצב רוח טוב ואנרגיה',
    strand:      'מצב רוח מורם ביום',
    icon:        '🍋',
    dayLean:     'morning',
    color:       '#FBBF24',
    shortLabel:  'מרים מצב רוח',
  },
  linalool: {
    label:       'מרגיע ומשקיט',
    sub:         'עוזר להירדם ומפחית חרדה',
    strand:      'נרדם בקלות',
    icon:        '💜',
    dayLean:     'evening',
    color:       '#C084FC',
    shortLabel:  'מרגיע ומשקיט',
  },
  caryophyllene: {
    label:       'מוריד כאב בלי לתקוע',
    sub:         'עוזר לכאב דלקת, לא מטשטש',
    strand:      'בלי כאב, בלי ערפול',
    icon:        '💪',
    dayLean:     'anytime',
    color:       '#F87171',
    shortLabel:  'נוגד כאב',
  },
  pinene: {
    label:       'ראש צלול, בלי ערפול',
    sub:         'ריכוז ועירנות, גם ביום',
    strand:      'ראש צלול ביום',
    icon:        '🌲',
    dayLean:     'morning',
    color:       '#4ADE80',
    shortLabel:  'ראש צלול',
  },
  terpinolene: {
    label:       'קליל ומרענן',
    sub:         'אנרגיה נקייה, לא מדכאת',
    strand:      'קל ומרענן',
    icon:        '⚡',
    dayLean:     'morning',
    color:       '#67E8F9',
    shortLabel:  'קליל ומרענן',
  },
  humulene: {
    label:       'מאזן ומרגיע',
    sub:         'מפחית תיאבון, מאזן את הגוף',
    strand:      'מאוזן ושקוט',
    icon:        '🌿',
    dayLean:     'anytime',
    color:       '#86EFAC',
    shortLabel:  'מאזן',
  },
};

/**
 * Get human label for a terpene key.
 * @param {string} key  — chemical key e.g. "myrcene"
 * @param {'label'|'sub'|'strand'|'shortLabel'|'icon'} field
 * @returns {string}
 */
export function terp(key, field = 'label') {
  return TERPENE_HUMAN[key]?.[field] || key;
}

/**
 * Build the DNA strand array from a terpene profile.
 * Returns up to maxStrands human-language strand strings, sorted by weight desc.
 *
 * @param {object} profile  — terpene weight map { myrcene: 0.8, limonene: 0.3 … }
 * @param {number} maxStrands
 * @returns {Array<{strand:string, icon:string, color:string, weight:number}>}
 */
export function buildDnaStrands(profile, maxStrands = 4) {
  return Object.entries(profile)
    .filter(([, v]) => v > 0.15)
    .sort(([, a], [, b]) => b - a)
    .slice(0, maxStrands)
    .map(([key, weight]) => ({
      strand: TERPENE_HUMAN[key]?.strand || key,
      icon:   TERPENE_HUMAN[key]?.icon   || '🌿',
      color:  TERPENE_HUMAN[key]?.color  || '#4ADE80',
      weight,
    }));
}

/**
 * Top two human labels for the kill-switch callout.
 * @param {object} profile  — terpene weight map (negative = avoid)
 * @returns {string[]}
 */
export function avoidedHumanLabels(profile) {
  return Object.entries(profile)
    .filter(([, v]) => v < -0.4)
    .sort(([, a], [, b]) => a - b)
    .slice(0, 2)
    .map(([key]) => TERPENE_HUMAN[key]?.shortLabel || key);
}
