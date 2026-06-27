import { createHmac } from "crypto";

/**
 * Compute a deterministic HMAC-SHA256 uniqueness key for a license number.
 *
 * DETERMINISTIC  — same input → same key → DB UNIQUE INDEX catches duplicates.
 * PROTECTED      — cannot reverse to license_number without SERVER_HMAC_SECRET
 *                  (env-only, never in client bundle, never logged).
 * PURPOSE        — uniqueness dedup only. NOT ownership verification.
 *
 * Throws if SERVER_HMAC_SECRET is absent or blank.
 */
export function computeLicenseUniquenessKey(licenseNumber) {
  const secret = process.env.SERVER_HMAC_SECRET;
  if (!secret) {
    throw new Error("SERVER_HMAC_SECRET not set — license uniqueness key cannot be computed");
  }
  if (typeof licenseNumber !== "string" || !licenseNumber.trim()) {
    throw new TypeError("licenseNumber must be a non-empty string");
  }
  return createHmac("sha256", secret)
    .update(licenseNumber.trim())
    .digest("hex");
}
