// Pure logic + constants for OnboardingV3 — no React/motion imports, so it is unit-testable
// in a plain node env without dragging the whole component graph (tesseract, framer-motion) in.

// Exact partner-tone microcopy (no first-person-plural). Tested verbatim.
export const READY_MICROCOPY = 'מספיק כדי להתחיל. ככל שתשתף יותר, ההצעות יתאימו טוב יותר.';

// experience: 'experienced' = veteran (≥1yr) → no default anxiolytic boost;
// 'little'/'first' = non-veteran → new-user route ON.
// Fork: only 'first' (חדש) → first-timer guidance; ותיק + יש ניסיון → past-strain picker.
export const EXPERIENCE_OPTIONS = [
  { id: 'experienced', label: 'ותיק',     sub: 'שנה ומעלה',    emoji: '🧬' },
  { id: 'little',      label: 'יש ניסיון', sub: 'כמה חודשים',   emoji: '🌿' },
  { id: 'first',       label: 'חדש',       sub: 'מתחיל/ה עכשיו', emoji: '🌱' },
];

// Full patient indication set the app supports. Each option carries the engine reason
// slug(s) (CONDITION_LEANS keys) it maps to — selection feeds those slugs to the engine.
export const INDICATION_OPTIONS = [
  { id: 'sleep',     label: 'שינה',            emoji: '🌙', reasons: ['sleep'] },
  { id: 'pain',      label: 'כאב כרוני',       emoji: '💊', reasons: ['pain'] },
  { id: 'neuro',     label: 'כאב עצבי',        emoji: '⚡', reasons: ['pain'] },
  { id: 'anxiety',   label: 'חרדה / מתח',      emoji: '🧘', reasons: ['anxiety'] },
  { id: 'ptsd',      label: 'פוסט-טראומה',     emoji: '🛡️', reasons: ['ptsd'] },
  { id: 'focus',     label: 'ריכוז ואנרגיה',   emoji: '🎯', reasons: ['focus'] },
  { id: 'appetite',  label: 'תיאבון / בחילות', emoji: '🍽️', reasons: ['appetite'] },
  { id: 'gi',        label: 'מערכת עיכול',     emoji: '🌿', reasons: ['gi'] },
  { id: 'mood',      label: 'מצב רוח',         emoji: '☀️', reasons: ['mood'] },
  { id: 'fibro',     label: 'פיברומיאלגיה',    emoji: '🌡️', reasons: ['pain', 'sleep'] },
  { id: 'ms',        label: 'טרשת נפוצה',      emoji: '🧠', reasons: ['pain', 'sleep'] },
  { id: 'parkinson', label: 'פרקינסון',        emoji: '🤲', reasons: ['sleep', 'focus'] },
  { id: 'epilepsy',  label: 'אפילפסיה',        emoji: '💫', reasons: ['epilepsy'] },
  { id: 'oncology',  label: 'סרטן / אונקולוגיה', emoji: '🎗️', reasons: ['pain', 'appetite'] },
  { id: 'nausea',    label: 'בחילות והקאות',   emoji: '🤢', reasons: ['appetite'] },
  { id: 'tourette',  label: 'טיקים / טורט',    emoji: '🔄', reasons: ['anxiety', 'focus'] },
  { id: 'autism',    label: 'אוטיזם',          emoji: '🌈', reasons: ['anxiety', 'focus'] },
  { id: 'dementia',  label: 'דמנציה',          emoji: '🧩', reasons: ['sleep', 'focus'] },
  { id: 'palliative', label: 'פליאטיבי',       emoji: '🕊️', reasons: ['pain', 'sleep', 'appetite'] },
];

// Map selected indication option ids → unique engine reason slugs (for scoring + DNA reveal).
export function indicationReasons(ids = []) {
  const set = new Set();
  for (const id of ids) {
    const o = INDICATION_OPTIONS.find((x) => x.id === id);
    (o?.reasons || []).forEach((r) => set.add(r));
  }
  return [...set];
}

export const DAYPART_OPTIONS = [
  { id: 'day',    label: 'ביום',          emoji: '☀️' },
  { id: 'night',  label: 'בערב/לילה',     emoji: '🌙' },
  { id: 'allday', label: 'לאורך כל היום', emoji: '🔄' },
];

export function dayPartToTimes(dayPart) {
  if (dayPart === 'day')    return ['morning', 'noon', 'afternoon'];
  if (dayPart === 'night')  return ['evening', 'night'];
  if (dayPart === 'allday') return ['morning', 'noon', 'afternoon', 'evening', 'night'];
  return [];
}

export function experienceToTolerance(exp) {
  return exp === 'experienced' ? 'veteran' : exp === 'little' ? 'medium' : 'new';
}

// Screen 2 gate: experience required + indication MANDATORY for everyone (incl. first-timers).
export function screen2Complete({ experience, indications }) {
  return Boolean(experience) && Array.isArray(indications) && indications.length > 0;
}

// First-timer → guidance (never the past-strain screen). Everyone else → past-strain.
export function screen3Mode(experience) {
  return experience === 'first' ? 'guidance' : 'past_strain';
}

// Build a representative chem profile from the derived onboarding answers, for the DNA reveal:
// terpenes from the chosen indications (REASONS map), chemotype/shape from experience tolerance.
import { REASONS } from '../data/strainsConfig.js';

export function deriveProfileBatch(indications = [], experience) {
  const counts = {};
  for (const id of indications) {
    const r = REASONS.find((x) => x.id === id);
    (r?.terps || []).forEach((t, i) => { counts[t] = (counts[t] || 0) + (2 - i * 0.5); });
  }
  const terpenes = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([terpene, pct]) => ({ terpene, pct }));
  const ratio = experience === 'experienced' ? { thcPct: 22, cbdPct: 4 }
              : experience === 'little'       ? { thcPct: 15, cbdPct: 3 }
              :                                 { thcPct: 10, cbdPct: 10 };
  return { ...ratio, terpenes: terpenes.length ? terpenes : [{ terpene: 'myrcene', pct: 1 }] };
}

// Past-strain screen requires at least one liked AND one disliked pick.
// Multi-select: liked/disliked are arrays (≥1 each). Strings/objects also accepted (single).
export function pastStrainComplete({ liked, disliked }) {
  const ok = (v) => (Array.isArray(v) ? v.length > 0 : Boolean(v));
  return ok(liked) && ok(disliked);
}
