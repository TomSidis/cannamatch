/**
 * licenseHash.test.js — Tests for HMAC-SHA256 license uniqueness key.
 *
 * Tests:
 *   A. Deterministic — same license number → same key every time
 *   B. Unique — different numbers → different keys
 *   C. Duplicate registration — same license produces identical key (DB UNIQUE fires)
 *   D. No persistence — raw license number absent from output
 *   E. Error cases — missing secret, blank input
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { computeLicenseUniquenessKey } from "../licenseHash.js";

const TEST_SECRET = "test-hmac-secret-do-not-use-in-production";

describe("computeLicenseUniquenessKey — correctness", () => {
  beforeEach(() => {
    vi.stubEnv("SERVER_HMAC_SECRET", TEST_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("A — deterministic: same license number always produces the same key", () => {
    const k1 = computeLicenseUniquenessKey("12345678");
    const k2 = computeLicenseUniquenessKey("12345678");
    expect(k1).toBe(k2);
    expect(k1).toMatch(/^[0-9a-f]{64}$/); // valid SHA-256 hex
  });

  it("B — unique: different license numbers produce different keys", () => {
    const kA = computeLicenseUniquenessKey("IMC-AAA-001");
    const kB = computeLicenseUniquenessKey("IMC-BBB-002");
    expect(kA).not.toBe(kB);
  });

  it("C — duplicate registration: same license → identical key (DB UNIQUE INDEX will reject second INSERT)", () => {
    const first  = computeLicenseUniquenessKey("IMC-2024-99999");
    const second = computeLicenseUniquenessKey("IMC-2024-99999");
    expect(first).toBe(second);
    // DB enforcement: migration 010 creates UNIQUE INDEX on license_uniqueness_key
    // so two users attempting to register the same license number will produce the
    // same key and PostgreSQL will throw error code 23505 on the second INSERT.
  });

  it("D — raw license number is absent from the output (no persistence of raw value)", () => {
    const raw = "raw-license-9876543";
    const key = computeLicenseUniquenessKey(raw);
    expect(key).not.toContain(raw);
    expect(key).not.toContain(raw.replace(/-/g, ""));
    expect(key).toMatch(/^[0-9a-f]{64}$/); // opaque hex — raw value unreachable
  });

  it("D2 — whitespace-trimmed: leading/trailing spaces do not change the key", () => {
    const clean = computeLicenseUniquenessKey("IMC-001");
    const padded = computeLicenseUniquenessKey("  IMC-001  ");
    expect(clean).toBe(padded);
  });
});

describe("computeLicenseUniquenessKey — error cases", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("E1 — throws if SERVER_HMAC_SECRET is not set", () => {
    vi.stubEnv("SERVER_HMAC_SECRET", "");
    expect(() => computeLicenseUniquenessKey("12345678")).toThrow(
      "SERVER_HMAC_SECRET not set",
    );
  });

  it("E2 — throws for empty license number", () => {
    vi.stubEnv("SERVER_HMAC_SECRET", TEST_SECRET);
    expect(() => computeLicenseUniquenessKey("")).toThrow();
  });

  it("E3 — throws for whitespace-only license number", () => {
    vi.stubEnv("SERVER_HMAC_SECRET", TEST_SECRET);
    expect(() => computeLicenseUniquenessKey("   ")).toThrow();
  });

  it("E4 — throws for non-string input", () => {
    vi.stubEnv("SERVER_HMAC_SECRET", TEST_SECRET);
    expect(() => computeLicenseUniquenessKey(null)).toThrow();
    expect(() => computeLicenseUniquenessKey(12345678)).toThrow();
  });
});
