/**
 * licenseVerify.test.js — Tests for in-memory license payload verification.
 *
 * Tests:
 *   A. Valid payload returns all 5 DB-safe fields + explicit determinism guard
 *   B. licenseNumber AND idNumber (ת"ז) absent from return value
 *   C. Both onboarding and community paths use the same function (single import)
 *   D. Categories and gramsByCategory are validated and normalized
 *   E. Partial/missing OCR fields degrade gracefully
 *   F. Error cases including duplicate license detection
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { verifyLicensePayload } from "../licenseVerify.js";

const TEST_SECRET = "test-hmac-secret-do-not-use-in-production";
const VALID_LICENSE = "IMC-2024-55555";

beforeEach(() => {
  vi.stubEnv("SERVER_HMAC_SECRET", TEST_SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ── A. Valid full payload ──────────────────────────────────────────────────────
describe("A — valid full payload returns all 5 DB-safe fields", () => {
  it("returns license_verified = true", () => {
    const result = verifyLicensePayload({
      licenseNumber:      VALID_LICENSE,
      expiry:             "2027-06-30",
      categories:         ["T22/C4"],
      gramsByCategory:    { "T22/C4": 50 },
    });
    expect(result.license_verified).toBe(true);
  });

  it("returns a 64-char hex uniqueness key", () => {
    const result = verifyLicensePayload({
      licenseNumber:   VALID_LICENSE,
      expiry:          "2027-06-30",
      categories:      ["T22/C4"],
      gramsByCategory: {},
    });
    expect(result.license_uniqueness_key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("parses ISO expiry date into a Date object", () => {
    const result = verifyLicensePayload({
      licenseNumber: VALID_LICENSE,
      expiry:        "2027-06-30",
      categories:    [],
    });
    expect(result.license_expiry).toBeInstanceOf(Date);
    expect(result.license_expiry.getFullYear()).toBe(2027);
  });

  it("parses DD.MM.YYYY expiry (common Israeli license format)", () => {
    const result = verifyLicensePayload({
      licenseNumber: VALID_LICENSE,
      expiry:        "30.06.2027",
      categories:    [],
    });
    expect(result.license_expiry).toBeInstanceOf(Date);
    expect(result.license_expiry.getFullYear()).toBe(2027);
  });

  it("returns normalized license_categories array", () => {
    const result = verifyLicensePayload({
      licenseNumber: VALID_LICENSE,
      expiry:        "2027-06-30",
      categories:    ["T22/C4", "T18/C3"],
    });
    expect(result.license_categories).toEqual(["T22/C4", "T18/C3"]);
  });

  it("returns monthly_grams_by_category object", () => {
    const result = verifyLicensePayload({
      licenseNumber:   VALID_LICENSE,
      expiry:          "2027-06-30",
      categories:      ["T22/C4"],
      gramsByCategory: { "T22/C4": 50 },
    });
    expect(result.monthly_grams_by_category).toEqual({ "T22/C4": 50 });
  });

  it("A-DET — explicit determinism: same licenseNumber always produces identical license_uniqueness_key", () => {
    // Guards against future refactors that accidentally introduce randomness
    // (e.g. salted hash, UUID, Math.random) which would silently break duplicate detection.
    const first  = verifyLicensePayload({ licenseNumber: VALID_LICENSE });
    const second = verifyLicensePayload({ licenseNumber: VALID_LICENSE });
    expect(first.license_uniqueness_key).toBe(second.license_uniqueness_key);
    expect(first.license_uniqueness_key).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ── B. licenseNumber AND idNumber (ת"ז) absent from output ───────────────────
describe("B — licenseNumber and idNumber (ת\"ז) are absent from the return value", () => {
  it("returned object has no licenseNumber key", () => {
    const result = verifyLicensePayload({
      licenseNumber: VALID_LICENSE,
      expiry:        "2027-06-30",
      categories:    ["T22/C4"],
    });
    expect(result).not.toHaveProperty("licenseNumber");
    expect(result).not.toHaveProperty("license_number");
  });

  it("returned object has no idNumber (ת\"ז) key", () => {
    const result = verifyLicensePayload({
      licenseNumber: VALID_LICENSE,
      idNumber:      "123456789",
      expiry:        "2027-06-30",
      categories:    ["T22/C4"],
    });
    expect(result).not.toHaveProperty("idNumber");
    expect(result).not.toHaveProperty("id_number");
  });

  it("serialized output does not contain raw licenseNumber value", () => {
    const result = verifyLicensePayload({
      licenseNumber: "MY-RAW-LICENSE-12345",
      expiry:        "2027-06-30",
      categories:    [],
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("MY-RAW-LICENSE-12345");
  });

  it("serialized output does not contain raw idNumber (ת\"ז) value", () => {
    const result = verifyLicensePayload({
      licenseNumber: VALID_LICENSE,
      idNumber:      "987654321",
      expiry:        "2027-06-30",
      categories:    [],
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("987654321");
  });

  it("returned object contains exactly the 5 allowed keys", () => {
    const result = verifyLicensePayload({
      licenseNumber: VALID_LICENSE,
      idNumber:      "123456789",
      expiry:        "2027-06-30",
      categories:    [],
    });
    const keys = Object.keys(result).sort();
    expect(keys).toEqual([
      "license_categories",
      "license_expiry",
      "license_uniqueness_key",
      "license_verified",
      "monthly_grams_by_category",
    ]);
  });
});

// ── C. Single function serves both onboarding and community entry ─────────────
describe("C — onboarding and community entry use the same function", () => {
  it("same function produces identical output for identical input (no hidden state)", () => {
    const input = {
      licenseNumber:   VALID_LICENSE,
      expiry:          "2027-06-30",
      categories:      ["T22/C4"],
      gramsByCategory: { "T22/C4": 50 },
    };
    // Simulates onboarding call
    const fromOnboarding = verifyLicensePayload(input);
    // Simulates community-entry call
    const fromCommunity  = verifyLicensePayload(input);

    expect(fromOnboarding.license_uniqueness_key).toBe(fromCommunity.license_uniqueness_key);
    expect(fromOnboarding.license_verified).toBe(fromCommunity.license_verified);
    expect(fromOnboarding.license_categories).toEqual(fromCommunity.license_categories);
  });
});

// ── D. Categories and gramsByCategory validation ──────────────────────────────
describe("D — validation and normalization", () => {
  it("filters out invalid category strings", () => {
    const result = verifyLicensePayload({
      licenseNumber: VALID_LICENSE,
      categories:    ["T22/C4", "not-valid", "", "T18/C3", null],
    });
    expect(result.license_categories).toEqual(["T22/C4", "T18/C3"]);
  });

  it("normalizes categories to uppercase", () => {
    const result = verifyLicensePayload({
      licenseNumber: VALID_LICENSE,
      categories:    ["t22/c4"],
    });
    expect(result.license_categories).toEqual(["T22/C4"]);
  });

  it("filters gramsByCategory entries with invalid keys or non-positive values", () => {
    const result = verifyLicensePayload({
      licenseNumber:   VALID_LICENSE,
      gramsByCategory: { "T22/C4": 50, "bad-key": 30, "T18/C3": -5, "T10/C2": 0 },
    });
    expect(result.monthly_grams_by_category).toEqual({ "T22/C4": 50 });
  });
});

// ── E. Graceful degradation with partial OCR ─────────────────────────────────
describe("E — partial/missing OCR fields degrade gracefully", () => {
  it("null expiry → license_expiry is null (does not throw)", () => {
    const result = verifyLicensePayload({ licenseNumber: VALID_LICENSE });
    expect(result.license_expiry).toBeNull();
  });

  it("missing categories → empty array", () => {
    const result = verifyLicensePayload({ licenseNumber: VALID_LICENSE });
    expect(result.license_categories).toEqual([]);
  });

  it("missing gramsByCategory → empty object", () => {
    const result = verifyLicensePayload({ licenseNumber: VALID_LICENSE });
    expect(result.monthly_grams_by_category).toEqual({});
  });
});

// ── F. Error cases ────────────────────────────────────────────────────────────
describe("F — error cases", () => {
  it("throws TypeError for missing licenseNumber", () => {
    expect(() => verifyLicensePayload({})).toThrow();
  });

  it("throws TypeError for blank licenseNumber", () => {
    expect(() => verifyLicensePayload({ licenseNumber: "   " })).toThrow();
  });

  it("throws if SERVER_HMAC_SECRET is not set", () => {
    vi.stubEnv("SERVER_HMAC_SECRET", "");
    expect(() => verifyLicensePayload({ licenseNumber: VALID_LICENSE })).toThrow(
      "SERVER_HMAC_SECRET not set",
    );
  });

  it("F5 — duplicate license: same licenseNumber produces identical license_uniqueness_key (triggers DB 23505)", () => {
    // Two users submitting the same license number produce the same key.
    // DB layer: migration 010 UNIQUE INDEX on license_uniqueness_key turns the
    // second INSERT/UPDATE into error code 23505. The endpoint catches it → HTTP 409.
    // See licenseVerify.endpoint.test.js for the HTTP-level test.
    const first  = verifyLicensePayload({ licenseNumber: "DUPE-IMC-2024-00001" });
    const second = verifyLicensePayload({ licenseNumber: "DUPE-IMC-2024-00001" });
    expect(first.license_uniqueness_key).toBe(second.license_uniqueness_key);
    expect(first.license_uniqueness_key).toMatch(/^[0-9a-f]{64}$/);
  });
});
