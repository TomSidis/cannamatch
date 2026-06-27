/**
 * licenseExpiry.js — Phase C1: License expiry gate and warning for community contribution.
 *
 * Policy (from architect brief):
 *   - Expired license → user CANNOT contribute to community (POST /reviews blocked).
 *   - Core app (DNA, recommendations, catalog) is NOT affected — this gate is only
 *     for community contribution endpoints.
 *   - Warning surfaced when expiry is within EXPIRY_WARNING_DAYS days.
 *   - Unverified users (license_verified = false) are NOT gated — they contribute
 *     at the anonymous floor (0.10 trust weight per Q11 policy).
 */

const EXPIRY_WARNING_DAYS = 14;

/**
 * True if the license has a known, past expiry date.
 * null / unparseable → returns false (benefit of the doubt — don't block unknown expiry).
 *
 * @param {Date|string|null} expiryDate
 * @returns {boolean}
 */
export function isLicenseExpiredForCommunity(expiryDate) {
  if (!expiryDate) return false;
  const d = expiryDate instanceof Date ? expiryDate : new Date(expiryDate);
  if (isNaN(d.getTime())) return false;
  return d < new Date();
}

/**
 * Days until expiry from now. Negative = already expired. null = no date.
 *
 * @param {Date|string|null} expiryDate
 * @returns {number|null}
 */
export function daysUntilExpiry(expiryDate) {
  if (!expiryDate) return null;
  const d = expiryDate instanceof Date ? expiryDate : new Date(expiryDate);
  if (isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - Date.now()) / 86_400_000);
}

/**
 * Hebrew warning string if expiry is within EXPIRY_WARNING_DAYS days; null otherwise.
 * Returns null when already expired (that's an error, not a warning — see checkLicenseGate).
 *
 * @param {Date|string|null} expiryDate
 * @returns {string|null}
 */
export function getLicenseExpiryWarning(expiryDate) {
  const days = daysUntilExpiry(expiryDate);
  if (days === null || days < 0) return null;
  if (days === 0) return "הרישיון שלך פג היום — חדש כדי להמשיך לתרום לקהילה.";
  if (days <= EXPIRY_WARNING_DAYS) {
    return `הרישיון שלך פג בעוד ${days} ימים — חדש בקרוב כדי להמשיך לתרום.`;
  }
  return null;
}

/**
 * Community contribution gate.
 * Call with the users row; returns gate decision + optional warning.
 *
 * Gate only fires when license_verified = true AND the license has a known past expiry.
 * Unverified users (license_verified = false/null) pass through — Q11 anonymous floor applies.
 *
 * @param {{ license_verified?: boolean, license_expiry?: Date|string|null }|null} userRow
 * @returns {{ blocked: boolean, message?: string, warning: string|null }}
 */
export function checkLicenseGate(userRow) {
  const verified = !!userRow?.license_verified;
  const expiry   = userRow?.license_expiry ?? null;

  if (verified && isLicenseExpiredForCommunity(expiry)) {
    return {
      blocked: true,
      message: "רישיון פג תוקף — חדש את הרישיון כדי לתרום לקהילה.",
      warning: null,
    };
  }

  return {
    blocked: false,
    warning: getLicenseExpiryWarning(expiry),
  };
}
