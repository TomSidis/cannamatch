import { computeLicenseUniquenessKey } from "./licenseHash.js";

const VALID_CATEGORY_RE = /^[TC]\d+\/[TC]\d+$/i;

/**
 * Verify license OCR payload in memory.
 *
 * SHARED by both onboarding and community entry — single implementation, no duplication.
 *
 * Input:  raw OCR fields (licenseNumber is required; others may be partial/null from OCR)
 * Output: the 5 DB-safe fields only — licenseNumber is never present in the return value
 *
 * The caller MUST NOT log or persist licenseNumber after this call.
 * licenseNumber is eligible for GC once this function returns.
 *
 * Throws: TypeError if licenseNumber is missing/blank
 *         Error if SERVER_HMAC_SECRET is not configured
 */
export function verifyLicensePayload({ licenseNumber, idNumber, expiry, categories, gramsByCategory }) {
  // idNumber (ת"ז) is accepted in-memory only — never referenced after this line.
  void idNumber;

  // Derive the uniqueness key — the only operation that touches licenseNumber.
  const license_uniqueness_key = computeLicenseUniquenessKey(licenseNumber);

  // licenseNumber is not referenced below this line.

  const license_expiry = parseExpiryDate(expiry);

  const license_categories = Array.isArray(categories)
    ? categories
        .filter((c) => typeof c === "string" && VALID_CATEGORY_RE.test(c.trim()))
        .map((c) => c.trim().toUpperCase())
    : [];

  const monthly_grams_by_category =
    gramsByCategory && typeof gramsByCategory === "object" && !Array.isArray(gramsByCategory)
      ? Object.fromEntries(
          Object.entries(gramsByCategory).filter(
            ([k, v]) => VALID_CATEGORY_RE.test(k) && typeof v === "number" && v > 0,
          ),
        )
      : {};

  return {
    license_verified:          true,
    license_uniqueness_key,
    license_expiry,             // Date | null
    license_categories,
    monthly_grams_by_category,
  };
}

// Date parser — mirrors src/lib/licenseUtils.js parseExpiryDate but kept server-side
// to avoid pulling frontend code into the backend bundle.
function parseExpiryDate(str) {
  if (!str || typeof str !== "string") return null;
  // ISO: 2026-03-15
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }
  // DD/MM/YYYY or DD.MM.YYYY
  const dmy = str.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (dmy) {
    const d = new Date(`${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`);
    return isNaN(d.getTime()) ? null : d;
  }
  // MM/YYYY — last day of given month
  const my = str.match(/^(\d{1,2})[./](\d{4})$/);
  if (my) {
    const d = new Date(parseInt(my[2]), parseInt(my[1]), 0);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}
