/**
 * commentFilterConfig.js — Configurable filter rules for community comments.
 *
 * BLOCKED_WORDS and SALES_KEYWORDS are stubs. The mechanism (commentFilter.js)
 * reads from these arrays at call time — populate them here when ready.
 * Do not add words inline in commentFilter.js.
 */

export const MAX_BODY_LENGTH = 1000;

// TODO: populate with Hebrew profanity list before production launch.
export const BLOCKED_WORDS = [];

// Sales/spam keywords — extended at will.
export const SALES_KEYWORDS = [
  "למכירה", "מכירה", "לרכישה", "להזמנה", "מחיר", "מחירים",
  "שקלים", "₪", 'ש"ח', "קנה", "קנו", "זמין", "במבצע",
];

// Israeli phone number patterns: 05X-XXXXXXX / 05XXXXXXXXX / +972
// \b works for 05X numbers (digits = word chars).
// +972 has no \b — '+' is not a word char, so \b before it never fires.
export const PHONE_PATTERN =
  /\b05\d[-\s]?\d{3}[-\s]?\d{4}\b|\+972/;

// External link patterns — bare domains limited to common TLDs.
// Preceded by lookbehind that exempts email-format (user@domain.com).
export const EXTERNAL_LINK_PATTERN =
  /https?:\/\/|www\.|(?<![a-zA-Z0-9@])[\w-]{2,}\.(com|net|org|io|co\.il|il)\b/i;
