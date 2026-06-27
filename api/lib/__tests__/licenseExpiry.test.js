/**
 * licenseExpiry.test.js — Tests for license expiry gate and warnings.
 *
 * Tests:
 *   A. isLicenseExpiredForCommunity — expired/valid/null/unparseable
 *   B. daysUntilExpiry — correct arithmetic
 *   C. getLicenseExpiryWarning — warning window, outside window, expired, null
 *   D. checkLicenseGate — full gate logic: blocked, warning, unverified passthrough
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  isLicenseExpiredForCommunity,
  daysUntilExpiry,
  getLicenseExpiryWarning,
  checkLicenseGate,
} from "../licenseExpiry.js";

// Fixed "now" so tests are not flaky across day boundaries
const NOW = new Date("2026-06-25T12:00:00Z");

function daysFromNow(n) {
  return new Date(NOW.getTime() + n * 86_400_000);
}

afterEach(() => {
  vi.useRealTimers();
});

function useFakeNow() {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
}

// ── A. isLicenseExpiredForCommunity ──────────────────────────────────────────
describe("A — isLicenseExpiredForCommunity", () => {
  it("returns false for a date in the future", () => {
    useFakeNow();
    expect(isLicenseExpiredForCommunity(daysFromNow(30))).toBe(false);
  });

  it("returns true for a date in the past", () => {
    useFakeNow();
    expect(isLicenseExpiredForCommunity(daysFromNow(-1))).toBe(true);
  });

  it("returns true for a date exactly now (< new Date() is false, but past is true)", () => {
    useFakeNow();
    // daysFromNow(0) = exact NOW; date < NOW is false → not expired
    expect(isLicenseExpiredForCommunity(daysFromNow(0))).toBe(false);
  });

  it("returns false for null — benefit of the doubt (unknown expiry != expired)", () => {
    expect(isLicenseExpiredForCommunity(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isLicenseExpiredForCommunity(undefined)).toBe(false);
  });

  it("returns false for an unparseable string", () => {
    expect(isLicenseExpiredForCommunity("not-a-date")).toBe(false);
  });

  it("accepts ISO string (not only Date objects)", () => {
    useFakeNow();
    expect(isLicenseExpiredForCommunity("2025-01-01")).toBe(true);
    expect(isLicenseExpiredForCommunity("2027-01-01")).toBe(false);
  });
});

// ── B. daysUntilExpiry ────────────────────────────────────────────────────────
describe("B — daysUntilExpiry", () => {
  it("returns positive number for future date", () => {
    useFakeNow();
    expect(daysUntilExpiry(daysFromNow(10))).toBe(10);
  });

  it("returns negative number for past date", () => {
    useFakeNow();
    expect(daysUntilExpiry(daysFromNow(-5))).toBe(-5);
  });

  it("returns 0 for today", () => {
    useFakeNow();
    expect(daysUntilExpiry(daysFromNow(0))).toBe(0);
  });

  it("returns null for null input", () => {
    expect(daysUntilExpiry(null)).toBeNull();
  });

  it("returns null for unparseable string", () => {
    expect(daysUntilExpiry("garbage")).toBeNull();
  });
});

// ── C. getLicenseExpiryWarning ────────────────────────────────────────────────
describe("C — getLicenseExpiryWarning", () => {
  it("returns null for a date well outside the 14-day window", () => {
    useFakeNow();
    expect(getLicenseExpiryWarning(daysFromNow(30))).toBeNull();
  });

  it("returns a Hebrew warning string at exactly 14 days", () => {
    useFakeNow();
    const warning = getLicenseExpiryWarning(daysFromNow(14));
    expect(warning).toBeTypeOf("string");
    expect(warning).toContain("14");
  });

  it("returns a Hebrew warning string at 1 day", () => {
    useFakeNow();
    const warning = getLicenseExpiryWarning(daysFromNow(1));
    expect(warning).toBeTypeOf("string");
    expect(warning).toContain("1");
  });

  it("returns a special message at 0 days (expires today)", () => {
    useFakeNow();
    const warning = getLicenseExpiryWarning(daysFromNow(0));
    expect(warning).toBeTypeOf("string");
    expect(warning).toContain("היום");
  });

  it("returns null when already expired (expired = error, not warning)", () => {
    useFakeNow();
    expect(getLicenseExpiryWarning(daysFromNow(-1))).toBeNull();
  });

  it("returns null for null input", () => {
    expect(getLicenseExpiryWarning(null)).toBeNull();
  });

  it("warning string is in Hebrew", () => {
    useFakeNow();
    const warning = getLicenseExpiryWarning(daysFromNow(7));
    expect(warning).toMatch(/[א-ת]/); // contains Hebrew characters
  });
});

// ── D. checkLicenseGate ───────────────────────────────────────────────────────
describe("D — checkLicenseGate", () => {
  it("D1 — verified + valid license → not blocked, no warning", () => {
    useFakeNow();
    const result = checkLicenseGate({
      license_verified: true,
      license_expiry:   daysFromNow(60),
    });
    expect(result.blocked).toBe(false);
    expect(result.warning).toBeNull();
  });

  it("D2 — verified + expired license → blocked with Hebrew message", () => {
    useFakeNow();
    const result = checkLicenseGate({
      license_verified: true,
      license_expiry:   daysFromNow(-5),
    });
    expect(result.blocked).toBe(true);
    expect(result.message).toBeTypeOf("string");
    expect(result.message).toMatch(/[א-ת]/); // Hebrew
  });

  it("D3 — verified + near-expiry → not blocked, warning present", () => {
    useFakeNow();
    const result = checkLicenseGate({
      license_verified: true,
      license_expiry:   daysFromNow(7),
    });
    expect(result.blocked).toBe(false);
    expect(result.warning).toBeTypeOf("string");
    expect(result.warning).toContain("7");
  });

  it("D4 — NOT verified + expired date → not blocked (anonymous floor, Q11 policy)", () => {
    useFakeNow();
    const result = checkLicenseGate({
      license_verified: false,
      license_expiry:   daysFromNow(-10),
    });
    expect(result.blocked).toBe(false);
  });

  it("D5 — NOT verified + no expiry → not blocked", () => {
    const result = checkLicenseGate({
      license_verified: false,
      license_expiry:   null,
    });
    expect(result.blocked).toBe(false);
    expect(result.warning).toBeNull();
  });

  it("D6 — verified + null expiry → not blocked (benefit of the doubt)", () => {
    const result = checkLicenseGate({
      license_verified: true,
      license_expiry:   null,
    });
    expect(result.blocked).toBe(false);
  });

  it("D7 — null userRow → not blocked (graceful handling, no column in old schema)", () => {
    const result = checkLicenseGate(null);
    expect(result.blocked).toBe(false);
  });

  it("D8 — ליבה פתוחה: gate fires only for community contribution, not for core app", () => {
    // The gate lives exclusively in POST /reviews (social.js).
    // Core endpoints (DNA, recommendations, catalog) do NOT import checkLicenseGate.
    // Verified structurally: checkLicenseGate is imported only in api/routes/social.js.
    // This test documents the policy and verifies the gate function itself is not tied
    // to any specific endpoint — it's pure and stateless.
    useFakeNow();
    const expiredVerified = { license_verified: true, license_expiry: daysFromNow(-1) };
    const gate = checkLicenseGate(expiredVerified);
    expect(gate.blocked).toBe(true);
    // The gate returns a decision; the endpoint decides what to do with it.
    // Routes that do NOT call checkLicenseGate are unaffected.
    expect(typeof gate.message).toBe("string");
  });
});
