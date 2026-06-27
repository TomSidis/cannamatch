/**
 * commentFilter.js — Comment body validation for community feed (C4).
 *
 * validateComment(body, overrides?) → { ok: boolean, reason?: string }
 *
 * Rejection reasons:
 *   'empty'          — missing or blank body
 *   'external_link'  — http(s)://, www., or recognisable bare domain
 *   'profanity'      — word in BLOCKED_WORDS config
 *   'sales'          — sales keyword or phone number pattern
 *
 * Image attachments go through a separate photo_url field — they do not
 * appear in the comment body, so this filter does not need to exempt them.
 *
 * Config override: pass { blockedWords, salesKeywords, phonePattern, linkPattern }
 * to inject test-specific rules without mutating the shared config.
 */

import {
  MAX_BODY_LENGTH,
  BLOCKED_WORDS,
  SALES_KEYWORDS,
  PHONE_PATTERN,
  EXTERNAL_LINK_PATTERN,
} from "./commentFilterConfig.js";

export function validateComment(body, overrides = {}) {
  const blockedWords  = overrides.blockedWords  ?? BLOCKED_WORDS;
  const salesKeywords = overrides.salesKeywords ?? SALES_KEYWORDS;
  const phonePattern  = overrides.phonePattern  ?? PHONE_PATTERN;
  const linkPattern   = overrides.linkPattern   ?? EXTERNAL_LINK_PATTERN;
  const maxLength     = overrides.maxLength     ?? MAX_BODY_LENGTH;

  if (!body || typeof body !== "string" || body.trim().length === 0) {
    return { ok: false, reason: "empty" };
  }

  // Length check — reject loudly rather than silently truncating
  if (body.trim().length > maxLength) {
    return { ok: false, reason: "too_long", maxLength };
  }

  const text  = body.trim();
  const lower = text.toLowerCase();

  // 1. External links
  if (linkPattern.test(text)) {
    return { ok: false, reason: "external_link" };
  }

  // 2. Profanity
  for (const word of blockedWords) {
    if (lower.includes(word.toLowerCase())) {
      return { ok: false, reason: "profanity" };
    }
  }

  // 3. Sales keywords + phone numbers (both treated as sales/spam)
  for (const kw of salesKeywords) {
    if (lower.includes(kw.toLowerCase())) {
      return { ok: false, reason: "sales" };
    }
  }
  if (phonePattern.test(text)) {
    return { ok: false, reason: "sales" };
  }

  return { ok: true };
}
