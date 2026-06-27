/**
 * licenseVerify.endpoint.test.js — HTTP-level tests for POST /api/auth/verify-license.
 *
 * Tests:
 *   F6. DB unique constraint (23505) → HTTP 409, not 500
 *   F7. 409 response body contains neither licenseNumber nor idNumber (ת"ז)
 *   F8. Anomaly log fires for 23505 (userId only — no raw data logged)
 *
 * Uses an in-process express server + mocked db pool to avoid a real DB connection.
 *
 * vi.hoisted() is used to set env vars BEFORE any module is imported, because:
 *   - auth.js reads JWT_SECRET at module-level (const JWT_SECRET = process.env...)
 *   - db.js calls dotenv.config() at load time, which could override our env
 *   - vi.hoisted runs before vi.mock, which runs before imports
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

// Set env vars before any module loads — including before db.js runs dotenv.config()
vi.hoisted(() => {
  process.env.JWT_SECRET          = "test-jwt-secret-endpoint-c1";
  process.env.SERVER_HMAC_SECRET  = "test-hmac-secret-do-not-use-in-production";
});

// Mock db.js before auth.js imports it — path relative to this test file
vi.mock("../../db.js", () => ({
  pool: { connect: vi.fn() },
}));

import http    from "http";
import express from "express";
import jwt     from "jsonwebtoken";
import { pool }     from "../../db.js";
import authRouter   from "../../routes/auth.js";

const JWT_SIGN_SECRET  = "test-jwt-secret-endpoint-c1";  // must match vi.hoisted value
const TEST_HMAC_SECRET = "test-hmac-secret-do-not-use-in-production";

let server;
let baseUrl;

beforeAll(
  () =>
    new Promise((resolve) => {
      const app = express();
      app.use(express.json());
      app.use("/api/auth", authRouter);
      server = http.createServer(app);
      server.listen(0, "127.0.0.1", () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    }),
);

afterAll(
  () =>
    new Promise((resolve) => {
      server.close(resolve);
    }),
);

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeToken(userId = "test-user-endpoint-123") {
  return jwt.sign({ sub: userId, role: "user" }, JWT_SIGN_SECRET, { expiresIn: "1h" });
}

/**
 * Configure mock pool to return a client whose query() follows the given fn.
 * BEGIN and ROLLBACK always succeed; caller configures UPDATE behavior.
 */
function setupMockClient(onUpdate) {
  const client = {
    query: vi.fn(async (sql) => {
      if (/BEGIN/.test(sql) || /ROLLBACK/.test(sql)) return {};
      if (/UPDATE users/.test(sql)) return onUpdate(sql);
      return {};
    }),
    release: vi.fn(),
  };
  pool.connect.mockResolvedValue(client);
  return client;
}

function makeUniqueViolation() {
  const err = new Error(
    'duplicate key value violates unique constraint "idx_users_license_uniqueness_key"',
  );
  err.code = "23505";
  return err;
}

// ── F6 — 23505 → HTTP 409, not 500 ───────────────────────────────────────────
describe("F6 — duplicate license returns HTTP 409, not 500", () => {
  it("responds with 409 when the DB UNIQUE INDEX fires", async () => {
    setupMockClient(() => { throw makeUniqueViolation(); });

    const res = await fetch(`${baseUrl}/api/auth/verify-license`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${makeToken()}`,
      },
      body: JSON.stringify({
        licenseNumber:   "IMC-2024-DUPE-ENDPOINT-TEST",
        expiry:          "2027-06-30",
        categories:      ["T22/C4"],
        gramsByCategory: { "T22/C4": 50 },
      }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.message).toBe("רישיון זה כבר רשום במערכת.");
  });

  it("does NOT return HTTP 500 on unique violation", async () => {
    setupMockClient(() => { throw makeUniqueViolation(); });

    const res = await fetch(`${baseUrl}/api/auth/verify-license`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${makeToken()}`,
      },
      body: JSON.stringify({ licenseNumber: "IMC-2024-DUPE-2", expiry: "2027-06-30" }),
    });

    expect(res.status).not.toBe(500);
    expect(res.status).toBe(409);
  });
});

// ── F7 — response body contains no raw PII ───────────────────────────────────
describe("F7 — 409 response body does not expose licenseNumber or idNumber (ת\"ז)", () => {
  it("licenseNumber is absent from the 409 body", async () => {
    setupMockClient(() => { throw makeUniqueViolation(); });

    const res = await fetch(`${baseUrl}/api/auth/verify-license`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${makeToken()}`,
      },
      body: JSON.stringify({ licenseNumber: "SECRET-IMC-XYZ-99999", expiry: "2027-06-30" }),
    });

    expect(res.status).toBe(409);
    const bodyText = await res.text();
    expect(bodyText).not.toContain("SECRET-IMC-XYZ-99999");
  });

  it("idNumber (ת\"ז) is absent from the 409 body", async () => {
    setupMockClient(() => { throw makeUniqueViolation(); });

    const res = await fetch(`${baseUrl}/api/auth/verify-license`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${makeToken()}`,
      },
      body: JSON.stringify({
        licenseNumber: "IMC-2024-DUPE-3",
        idNumber:      "321654987",
        expiry:        "2027-06-30",
      }),
    });

    expect(res.status).toBe(409);
    const bodyText = await res.text();
    expect(bodyText).not.toContain("321654987");
  });
});

// ── F8 — anomaly log: userId only, no raw PII ────────────────────────────────
describe("F8 — anomaly log on duplicate contains userId only, no raw license data", () => {
  it("logs [anomaly] with the userId when 23505 fires", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    setupMockClient(() => { throw makeUniqueViolation(); });

    const userId = "spy-user-anomaly-888";
    await fetch(`${baseUrl}/api/auth/verify-license`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${makeToken(userId)}`,
      },
      body: JSON.stringify({ licenseNumber: "IMC-ANOMALY-SECRET", expiry: "2027-06-30" }),
    });

    const anomalyCalls = warnSpy.mock.calls.filter((args) =>
      args.some((a) => typeof a === "string" && a.includes("[anomaly]")),
    );
    expect(anomalyCalls.length).toBeGreaterThan(0);

    // Log must reference the userId but NOT the raw license number
    const logLine = anomalyCalls.flatMap((c) => c).join(" ");
    expect(logLine).toContain(userId);
    expect(logLine).not.toContain("IMC-ANOMALY-SECRET");

    warnSpy.mockRestore();
  });
});
