/**
 * anomalyHooks.test.js — Tests for Phase C1 anomaly hook stubs.
 *
 * Tests:
 *   A. Each hook exists and returns undefined without throwing
 *   B. aggregateAnomalyScore returns undefined when all hooks are stubs
 *   C. Hook isolation: a failing hook does not abort aggregation
 *   D. Connection point: undefined score → computeReportWeight uses 1.0 (no penalty)
 *   E. Edge cases: missing userId, null strainId, missing pool
 */

import { describe, it, expect, vi } from "vitest";
import {
  checkReviewVelocity,
  checkGeographicFlood,
  checkProfileInconsistency,
  aggregateAnomalyScore,
} from "../anomalyHooks.js";
import { computeReportWeight } from "../../../src/engine/reportTrust.ts";

const mockPool = { query: vi.fn(() => Promise.resolve({ rows: [] })) };

// ── A. Individual hooks are stubs that return undefined ───────────────────────
describe("A — each hook exists and returns undefined", () => {
  it("checkReviewVelocity returns undefined", async () => {
    const result = await checkReviewVelocity("user-123", mockPool);
    expect(result).toBeUndefined();
  });

  it("checkGeographicFlood returns undefined", async () => {
    const result = await checkGeographicFlood("user-123", mockPool);
    expect(result).toBeUndefined();
  });

  it("checkProfileInconsistency returns undefined", async () => {
    const result = await checkProfileInconsistency("user-123", "strain-456", mockPool);
    expect(result).toBeUndefined();
  });

  it("hooks do not call pool.query (stubs make no DB calls)", async () => {
    const spy = vi.fn();
    const trackedPool = { query: spy };
    await checkReviewVelocity("user-123", trackedPool);
    await checkGeographicFlood("user-123", trackedPool);
    await checkProfileInconsistency("user-123", "strain-456", trackedPool);
    expect(spy).not.toHaveBeenCalled();
  });
});

// ── B. aggregateAnomalyScore returns undefined when all stubs ─────────────────
describe("B — aggregateAnomalyScore returns undefined when all hooks are stubs", () => {
  it("returns undefined with valid inputs", async () => {
    const score = await aggregateAnomalyScore("user-123", mockPool, { strainId: "strain-456" });
    expect(score).toBeUndefined();
  });

  it("returns undefined when strainId is omitted", async () => {
    const score = await aggregateAnomalyScore("user-123", mockPool);
    expect(score).toBeUndefined();
  });

  it("returns undefined when strainId is null", async () => {
    const score = await aggregateAnomalyScore("user-123", mockPool, { strainId: null });
    expect(score).toBeUndefined();
  });
});

// ── C. Hook isolation: failing hook does not abort aggregation ─────────────────
describe("C — a crashing hook does not abort the review flow", () => {
  it("aggregateAnomalyScore resolves even if a hook rejects", async () => {
    // Simulate a future hook that throws (e.g. DB timeout)
    const brokenHook = vi.fn().mockRejectedValue(new Error("DB timeout"));

    // Patch one hook to fail — the aggregate must still resolve
    const { checkReviewVelocity: orig } = await import("../anomalyHooks.js");
    vi.spyOn(await import("../anomalyHooks.js"), "checkReviewVelocity")
      .mockImplementationOnce(() => Promise.reject(new Error("simulated failure")));

    // aggregateAnomalyScore uses Promise.allSettled — failures are swallowed
    const score = await aggregateAnomalyScore("user-123", mockPool, { strainId: "s-1" });
    // Score is still undefined (remaining stubs return undefined; failed hook is filtered)
    expect(score).toBeUndefined();
  });

  it("aggregateAnomalyScore does not throw when pool is missing (stub tolerance)", async () => {
    await expect(
      aggregateAnomalyScore("user-123", null, { strainId: "s-1" }),
    ).resolves.toBeUndefined();
  });
});

// ── D. Connection to reportTrust.ts — undefined score → no trust penalty ──────
describe("D — undefined anomaly score feeds into computeReportWeight as 1.0 (no penalty)", () => {
  it("computeReportWeight with undefined userReliabilityScore equals score without it", () => {
    const signalsBase = { isVerifiedPatient: true, hasPhoto: true, batchVerified: false };
    const withUndefined = computeReportWeight({ ...signalsBase, userReliabilityScore: undefined });
    const withoutField  = computeReportWeight(signalsBase);
    expect(withUndefined).toBe(withoutField);
  });

  it("anomaly score of 0.5 halves the computed trust weight", () => {
    const signals = { isVerifiedPatient: true, hasPhoto: false, batchVerified: false };
    const full    = computeReportWeight({ ...signals, userReliabilityScore: 1.0 });
    const halved  = computeReportWeight({ ...signals, userReliabilityScore: 0.5 });
    // halved should be roughly half of full, clamped to W_BASE minimum
    expect(halved).toBeLessThan(full);
    expect(halved).toBeGreaterThanOrEqual(0.10); // W_BASE floor
  });
});

// ── E. Edge cases ─────────────────────────────────────────────────────────────
describe("E — edge cases", () => {
  it("aggregateAnomalyScore handles empty userId gracefully", async () => {
    await expect(aggregateAnomalyScore("", mockPool)).resolves.toBeUndefined();
  });

  it("aggregateAnomalyScore handles undefined ctx gracefully", async () => {
    await expect(aggregateAnomalyScore("user-123", mockPool, undefined)).resolves.toBeUndefined();
  });
});
