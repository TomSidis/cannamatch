/**
 * licenseUtils.js — shared license security helpers (frontend, Web Crypto API)
 * All functions are pure / async-pure, no side effects.
 */

/** SHA-256 hash of a string → lowercase hex. Never store raw license/ID numbers. */
export async function hashLicenseId(idStr) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(idStr).trim()));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Israeli ID check-digit (Luhn-variant).
 * Returns false for obvious OCR garbage or invalid IDs.
 * Note: cannabis license numbers may differ from national ID; we use this as a
 * sanity filter, not a hard block, so a failed check → warn but don't reject.
 */
export function isValidIsraeliId(id) {
  const s = String(id).replace(/\D/g, "").padStart(9, "0");
  if (s.length !== 9) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let v = parseInt(s[i], 10) * ((i % 2) === 0 ? 1 : 2);
    if (v > 9) v -= 9;
    sum += v;
  }
  return sum % 10 === 0;
}

/**
 * Parse "YYYY-MM-DD", "DD/MM/YYYY", "MM/YYYY" expiry strings into a Date.
 * Returns null if unparseable.
 */
export function parseExpiryDate(str) {
  if (!str) return null;
  // ISO: 2026-03-15
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return new Date(str);
  // DD/MM/YYYY or DD.MM.YYYY
  const dmy = str.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (dmy) return new Date(`${dmy[3]}-${dmy[2].padStart(2,"0")}-${dmy[1].padStart(2,"0")}`);
  // MM/YYYY (day = last day of month)
  const my = str.match(/^(\d{1,2})[./](\d{4})$/);
  if (my) return new Date(parseInt(my[2]), parseInt(my[1]), 0); // day=0 → last day of prev month
  return null;
}

/** True if the license is already expired. */
export function isLicenseExpired(expiryStr) {
  const d = parseExpiryDate(expiryStr);
  return d ? d < new Date() : false;
}

/** Calendar days until expiry; negative = already expired; null if no date. */
export function daysToExpiry(expiryStr) {
  const d = parseExpiryDate(expiryStr);
  if (!d) return null;
  return Math.round((d.getTime() - Date.now()) / 86_400_000);
}

/**
 * Redraw the image on a canvas to strip all EXIF metadata (GPS, device info, etc.).
 * Returns a Blob. Falls back to original File on any error.
 */
export function stripExif(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width  = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext("2d").drawImage(img, 0, 0);
        canvas.toBlob(
          (blob) => { URL.revokeObjectURL(url); resolve(blob || file); },
          "image/jpeg",
          0.92,
        );
      } catch {
        URL.revokeObjectURL(url);
        resolve(file);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

/** localStorage key for stored license meta */
const LS_KEY = "cm_license_data";

/** Return the stored license hash, or null. */
export function getStoredLicenseHash() {
  try {
    const d = JSON.parse(localStorage.getItem(LS_KEY) || "null");
    return d?.idHash || null;
  } catch { return null; }
}

/**
 * Persist license meta. Stores only the SHA-256 hash of the ID — never the raw number.
 * Image is NOT stored. Fields: idHash, expiry (ISO string), cats, verifiedAt.
 */
export function storeLicenseMeta({ idHash, expiry, cats }) {
  localStorage.setItem(LS_KEY, JSON.stringify({
    idHash:     idHash || null,
    expiry:     expiry || null,
    cats:       cats   || [],
    verifiedAt: Date.now(),
  }));
}

/** Read back stored license meta (expiry, cats) for alerts/checks. */
export function readLicenseMeta() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "null"); }
  catch { return null; }
}

/** Remove all license data (account deletion / re-lock). */
export function clearLicenseMeta() {
  localStorage.removeItem(LS_KEY);
  localStorage.removeItem("cm_license");
}
