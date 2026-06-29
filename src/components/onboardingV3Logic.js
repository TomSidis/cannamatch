// Pure logic + constants for OnboardingV3 — no React/motion imports, so it is unit-testable
// in a plain node env without dragging the whole component graph (tesseract, framer-motion) in.

// Exact partner-tone microcopy (no first-person-plural). Tested verbatim.
export const READY_MICROCOPY = 'מספיק כדי להתחיל. ככל שתשתף יותר, ההצעות יתאימו טוב יותר.';

// experience: 'experienced' = veteran (≥1yr) → no default anxiolytic boost;
// 'little'/'first' = non-veteran → new-user route ON.
export const EXPERIENCE_OPTIONS = [
  { id: 'experienced', label: 'ניסיתי, ואני מנוסה', sub: 'משתמש/ת בקביעות', emoji: '🧬' },
  { id: 'little',      label: 'ניסיתי קצת',          sub: 'כמה פעמים בעבר',  emoji: '🌿' },
  { id: 'first',       label: 'פעם ראשונה',          sub: 'מתחיל/ה עכשיו',    emoji: '🌱' },
];

// indication ids = engine reason slugs (CONDITION_LEANS keys).
export const INDICATION_OPTIONS = [
  { id: 'sleep',    label: 'שינה',          emoji: '🌙' },
  { id: 'pain',     label: 'כאב',           emoji: '💊' },
  { id: 'anxiety',  label: 'חרדה / מתח',    emoji: '🧘' },
  { id: 'ptsd',     label: 'פוסט-טראומה',   emoji: '🛡️' },
  { id: 'focus',    label: 'ריכוז ואנרגיה', emoji: '⚡' },
  { id: 'appetite', label: 'תיאבון',        emoji: '🍽️' },
  { id: 'gi',       label: 'מערכת עיכול',   emoji: '🌿' },
  { id: 'mood',     label: 'מצב רוח',       emoji: '☀️' },
];

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

// Past-strain screen requires at least one liked AND one disliked pick.
// Multi-select: liked/disliked are arrays (≥1 each). Strings/objects also accepted (single).
export function pastStrainComplete({ liked, disliked }) {
  const ok = (v) => (Array.isArray(v) ? v.length > 0 : Boolean(v));
  return ok(liked) && ok(disliked);
}
