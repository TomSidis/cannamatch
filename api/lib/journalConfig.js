/**
 * journalConfig.js — Closed lists for Phase C2 treatment journal.
 *
 * EFFECTS IDs align exactly with EFFECT_AXIS_KEYS in terpeneScience.ts so that
 * C2.4's DNA profile mapper can use them directly without a translation layer.
 *
 * SIDE_EFFECTS "other" sentinel (isFreeText: true) → stored in side_effects_other column.
 * It is stripped before writing to the side_effects TEXT[] column and never fed to the
 * DNA profile.
 */

/** Therapeutic effects experienced during / after use. */
export const EFFECTS = [
  { id: "sleep",       label: "שינה",           emoji: "🌙" },
  { id: "antiPain",    label: "הקלה בכאב",      emoji: "💊" },
  { id: "antiAnxiety", label: "הרגעת חרדה",     emoji: "🧘" },
  { id: "mood",        label: "שיפור מצב רוח",  emoji: "☀️" },
  { id: "bodyCalm",    label: "רוגע גופני",      emoji: "🌿" },
  { id: "clearHead",   label: "ראש צלול",        emoji: "🎯" },
  { id: "appetite",    label: "עלייה בתיאבון",  emoji: "🍽️" },
];

/** Adverse / unwanted effects.  "other" is the only free-text sentinel. */
export const SIDE_EFFECTS = [
  { id: "dry_mouth",  label: "יובש בפה",      emoji: "🫦" },
  { id: "anxiety",    label: "חרדה",           emoji: "😬" },  // → anxietyTriggered in DNA mapping
  { id: "dizzy",      label: "סחרחורת",        emoji: "💫" },
  { id: "oversleep",  label: "ישנוניות יתר",   emoji: "😴" },
  { id: "foggy",      label: "ערפול",           emoji: "🌫️" },
  { id: "munchies",   label: "עלייה בתיאבון",  emoji: "🍽️" },  // distinct id from EFFECTS.appetite
  { id: "heart_rate", label: "דפיקות לב",      emoji: "💓" },
  { id: "headache",   label: "כאב ראש",         emoji: "🤕" },
  { id: "nausea",     label: "בחילה",           emoji: "🤢" },
  { id: "other",      label: "אחר",             emoji: "📝",  isFreeText: true },
];

export const EFFECT_IDS      = new Set(EFFECTS.map((e) => e.id));
export const SIDE_EFFECT_IDS = new Set(SIDE_EFFECTS.filter((e) => !e.isFreeText).map((e) => e.id));

/**
 * Filter an incoming array of IDs against the closed list.
 * Strips unknown IDs silently (never throw on client input).
 *
 * @param {string[]} incoming
 * @param {Set<string>} allowedIds
 * @returns {string[]}
 */
export function filterToClosedList(incoming, allowedIds) {
  if (!Array.isArray(incoming)) return [];
  return incoming.filter((id) => allowedIds.has(id));
}
