// Israeli cannabis category codes — single source of truth.
// Updated to reflect the Dec-2025 MOH reform.
// DO NOT hardcode category lists in routes or components — import from here.
// When the regulator updates category codes, change ONLY this file.

export const LICENSED_CATEGORIES = [
  'T22/C4',
  'T20/C4',
  'T18/C3',
  'T15/C3',
  'T12/C12',
  'T10/C10',
  'T10/C2',
  'T3/C15',
  'T3/C12',
];

export const DEFAULT_CATEGORY = 'T22/C4';

// 🚧 REGULATORY BLOCKER — Tom must verify with Israeli medical cannabis regulator
// that showing out-of-license product counts to patients is permitted, and in what
// exact wording. Set to true only after written legal sign-off.
// Conservative framing is already in place in the UI — but DO NOT enable before approval.
export const PEEK_WINDOW_ENABLED = false;
