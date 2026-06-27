/**
 * licenseExpiry.endpoint.test.js — HTTP-level tests for the community contribution gate.
 *
 * Tests the expiry gate wired into POST /reviews (social.js):
 *   E1. Verified + expired license → HTTP 403, cannot contribute
 *   E2. Verified + valid license → HTTP 200, can contribute
 *   E3. Verified + near-expiry (≤14 days) → HTTP 200 + licenseWarning in body
 *   E4. Unverified user → HTTP 200, no gate (anonymous floor, Q11 policy)
 *   E5. Core app endpoint (GET /social/genetic-twins) → HTTP 200, no expiry gate
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import http    from "http";
import express from "express";

vi.hoisted(() => {
  process.env.JWT_SECRET         = "test-jwt-secret-expiry-c1";
  process.env.SERVER_HMAC_SECRET = "test-hmac-secret-do-not-use-in-production";
});

vi.mock("../../db.js", () => ({
  pool: { connect: vi.fn(), query: vi.fn() },
}));

import jwt          from "jsonwebtoken";
import { pool }     from "../../db.js";
import socialRouter from "../../routes/social.js";

const JWT_SIGN_SECRET = "test-jwt-secret-expiry-c1";

// Fixed dates for deterministic tests
const FUTURE_DATE   = new Date(Date.now() + 60  * 86_400_000); // 60 days from now
const NEAR_DATE     = new Date(Date.now() +  7  * 86_400_000); // 7 days from now
const EXPIRED_DATE  = new Date(Date.now() -  5  * 86_400_000); // 5 days ago

let server;
let baseUrl;

beforeAll(
  () =>
    new Promise((resolve) => {
      const app = express();
      app.use(express.json());
      app.use("/api", socialRouter);
      server = http.createServer(app);
      server.listen(0, "127.0.0.1", () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    }),
);

afterAll(
  () => new Promise((resolve) => server.close(resolve)),
);

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeToken(userId = "test-user-expiry-001") {
  return jwt.sign({ sub: userId, role: "user" }, JWT_SIGN_SECRET, { expiresIn: "1h" });
}

/**
 * Build a mock pool client that simulates the review submission flow.
 * The license row determines gate behavior; other queries succeed minimally.
 */
function setupReviewClient({ license_verified, license_expiry }) {
  const client = {
    query: vi.fn(async (sql) => {
      if (/BEGIN/.test(sql))    return {};
      if (/ROLLBACK/.test(sql)) return {};
      if (/COMMIT/.test(sql))   return {};
      // Abuse guard — no recent review
      if (/FROM user_reviews.*24 hours/s.test(sql)) return { rows: [] };
      // License check (gate trigger)
      if (/SELECT license_verified/.test(sql)) {
        return { rows: [{ license_verified, license_expiry }] };
      }
      // Batch cross-reference
      if (/FROM grow_batch/.test(sql)) return { rows: [] };
      // INSERT review
      if (/INSERT INTO user_reviews/.test(sql)) return { rows: [{ id: "rev-e2e-1" }] };
      // DNA profile read + strain
      if (/FROM user_dna_profiles/.test(sql)) return { rows: [{ profile: {} }] };
      if (/FROM strains/.test(sql)) {
        return { rows: [{ lineage: "", embedding: new Array(12).fill(0) }] };
      }
      // DNA profile write
      if (/INTO user_dna_profiles/.test(sql)) return {};
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  pool.connect.mockResolvedValue(client);
  return client;
}

const BASE_REVIEW_BODY = {
  user_id:   "test-user-expiry-001",
  strain_id: "strain-abc",
  efficacy:  7,
};

// ── E1 — Verified + expired → 403 ────────────────────────────────────────────
describe("E1 — verified patient with expired license cannot contribute (403)", () => {
  it("returns 403 when license is expired", async () => {
    setupReviewClient({ license_verified: true, license_expiry: EXPIRED_DATE });

    const res = await fetch(`${baseUrl}/api/reviews`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(BASE_REVIEW_BODY),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.message).toMatch(/[א-ת]/); // Hebrew error message
    expect(body.error.message).toMatch(/רישיון/);
  });

  it("403 body does not contain the raw user_id or sensitive data beyond the message", async () => {
    setupReviewClient({ license_verified: true, license_expiry: EXPIRED_DATE });

    const res = await fetch(`${baseUrl}/api/reviews`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(BASE_REVIEW_BODY),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(Object.keys(body)).toEqual(["error"]);
  });
});

// ── E2 — Verified + valid → 200 ──────────────────────────────────────────────
describe("E2 — verified patient with valid license can contribute (200)", () => {
  it("returns 200 for verified user with future expiry", async () => {
    setupReviewClient({ license_verified: true, license_expiry: FUTURE_DATE });

    const res = await fetch(`${baseUrl}/api/reviews`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(BASE_REVIEW_BODY),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.licenseWarning).toBeNull();
  });
});

// ── E3 — Verified + near-expiry → 200 + warning ──────────────────────────────
describe("E3 — verified patient with near-expiry license gets warning in response", () => {
  it("returns 200 with licenseWarning string when expiry is ≤14 days away", async () => {
    setupReviewClient({ license_verified: true, license_expiry: NEAR_DATE });

    const res = await fetch(`${baseUrl}/api/reviews`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(BASE_REVIEW_BODY),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.licenseWarning).toBeTypeOf("string");
    expect(body.licenseWarning).toMatch(/[א-ת]/); // Hebrew
  });
});

// ── E4 — Unverified → 200 (no gate, anonymous floor) ────────────────────────
describe("E4 — unverified user passes through at anonymous floor (no expiry gate)", () => {
  it("returns 200 for unverified user even with expired date on record", async () => {
    setupReviewClient({ license_verified: false, license_expiry: EXPIRED_DATE });

    const res = await fetch(`${baseUrl}/api/reviews`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(BASE_REVIEW_BODY),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    // Trust weight is the anonymous floor (0.10) — no patient bonus
    expect(body.trust_weight).toBeCloseTo(0.10, 2);
  });
});

// ── E5 — Core app endpoint unaffected ────────────────────────────────────────
describe("E5 — core app (ליבה פתוחה): GET /social/genetic-twins has no expiry gate", () => {
  it("returns 200 from genetic-twins without checking license_expiry", async () => {
    // This endpoint queries user_dna_profiles and users, not license_expiry.
    // Mock pool.query for the direct pool call (non-transactional route).
    pool.query = vi.fn(async (sql) => {
      if (/FROM user_dna_profiles/.test(sql)) return { rows: [] };
      return { rows: [], count: 0 };
    });

    const res = await fetch(`${baseUrl}/api/social/genetic-twins/any-user-id?limit=5`);
    expect(res.status).toBe(200);
    // pool.query was called but never asked for license_expiry or license_verified
    const queryCalls = pool.query.mock.calls.map(([sql]) => sql);
    expect(queryCalls.every((sql) => !/license_expiry/.test(sql))).toBe(true);
    expect(queryCalls.every((sql) => !/license_verified/.test(sql))).toBe(true);
  });
});
