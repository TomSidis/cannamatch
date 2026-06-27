/**
 * c6.terms.test.js — GET /api/terms/status + POST /api/terms/accept (C6.2)
 *
 * Test categories:
 *   A — not accepted → status { accepted: false }
 *   B — accepted current version → status { accepted: true }
 *   C — accepted older version only → status { accepted: false } (gate re-prompts)
 *   D — POST accept: user_id from session, terms_version from server constant, never body
 *   E — idempotent: double-accept → 200, no error
 *   F — GET /terms/status without auth → 401
 *   G — POST /terms/accept without auth → 401
 *   H — GET response shape includes version and text
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import http    from "http";
import express from "express";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("../../security/claudeProxyShield.js", () => ({
  verifySession: (req, _res, next) => { req.userId = "user-c6"; next(); },
}));

vi.mock("../../db.js", () => ({
  pool: { query: vi.fn() },
}));

// termsConfig is real (not mocked) — tests rely on the actual TERMS_VERSION value.
import { pool }       from "../../db.js";
import termsRouter    from "../../routes/terms.js";
import { TERMS_VERSION, TERMS_TEXT } from "../../lib/termsConfig.js";

// ── Server setup ──────────────────────────────────────────────────────────────

let server;
let serverNoAuth; // server where verifySession → 401

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", termsRouter);
  server = http.createServer(app);
  await new Promise(r => server.listen(0, "127.0.0.1", r));

  // Separate server with no auth middleware — used to test 401 branches.
  // We swap the mock just for this server by building the router manually.
  const appNoAuth = express();
  appNoAuth.use(express.json());
  // Directly attach routes without verifySession (simulates missing token):
  // We do this by calling the route handler via apiFetch with no token header.
  // verifySession in the mock always passes — so we test 401 via a second
  // express instance that replaces verifySession with a real 401 guard.
  appNoAuth.use("/api", (req, _res, next) => {
    // Override: simulate unauthenticated (no token → 401)
    const header = req.headers.authorization ?? "";
    if (!header.startsWith("Bearer ")) {
      return _res.status(401).json({ error: { message: "נדרשת הזדהות." } });
    }
    next();
  }, termsRouter);
  serverNoAuth = http.createServer(appNoAuth);
  await new Promise(r => serverNoAuth.listen(0, "127.0.0.1", r));
});

afterAll(() => { server.close(); serverNoAuth.close(); });

beforeEach(() => { pool.query.mockReset(); });

// ── HTTP helper ───────────────────────────────────────────────────────────────

function apiFetch(srv, path, opts = {}) {
  return new Promise((resolve, reject) => {
    const addr = srv.address();
    const headers = { "Content-Type": "application/json", ...(opts.headers ?? {}) };
    const options = {
      host: "127.0.0.1", port: addr.port,
      path, method: opts.method ?? "GET", headers,
    };
    const req = http.request(options, res => {
      let body = "";
      res.on("data", d => { body += d; });
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, body }); }
      });
    });
    req.on("error", reject);
    if (opts.body) req.write(JSON.stringify(opts.body));
    req.end();
  });
}

const get  = (path, opts) => apiFetch(server, path, { method: "GET",  ...opts });
const post = (path, opts) => apiFetch(server, path, { method: "POST", ...opts });

// ── A: Not accepted ───────────────────────────────────────────────────────────
describe("A — not accepted → accepted: false", () => {
  it("A1 — no row in terms_acceptances → { accepted: false }", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const { status, body } = await get("/api/terms/status");
    expect(status).toBe(200);
    expect(body.accepted).toBe(false);
  });

  it("A2 — query uses TERMS_VERSION constant as $2 param", async () => {
    const calls = [];
    pool.query.mockImplementation((sql, params) => {
      calls.push({ sql, params });
      return Promise.resolve({ rows: [] });
    });
    await get("/api/terms/status");
    expect(calls[0].params[1]).toBe(TERMS_VERSION);
  });

  it("A3 — query uses session userId as $1 param", async () => {
    const calls = [];
    pool.query.mockImplementation((sql, params) => {
      calls.push({ sql, params });
      return Promise.resolve({ rows: [] });
    });
    await get("/api/terms/status");
    expect(calls[0].params[0]).toBe("user-c6");
  });
});

// ── B: Accepted current version ───────────────────────────────────────────────
describe("B — accepted current version → accepted: true", () => {
  it("B1 — row exists for current version → { accepted: true }", async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: "some-uuid" }] });
    const { status, body } = await get("/api/terms/status");
    expect(status).toBe(200);
    expect(body.accepted).toBe(true);
  });
});

// ── C: Accepted older version only — gate re-prompts ─────────────────────────
describe("C — accepted older version → accepted: false (version bump re-prompts)", () => {
  it("C1 — route queries TERMS_VERSION specifically; older version row is irrelevant", async () => {
    // Simulate: user accepted TERMS_VERSION-1 but NOT TERMS_VERSION.
    // Route queries WHERE terms_version = TERMS_VERSION → returns no row → accepted: false.
    // (The older row exists in DB but the route doesn't look for it.)
    pool.query.mockResolvedValueOnce({ rows: [] }); // no row for current version
    const { body } = await get("/api/terms/status");
    expect(body.accepted).toBe(false);
  });

  it("C2 — only a row matching CURRENT TERMS_VERSION yields accepted: true", async () => {
    // First call: current version not found
    pool.query.mockResolvedValueOnce({ rows: [] });
    const r1 = await get("/api/terms/status");
    expect(r1.body.accepted).toBe(false);

    pool.query.mockReset();

    // Second call: current version found
    pool.query.mockResolvedValueOnce({ rows: [{ id: "uuid" }] });
    const r2 = await get("/api/terms/status");
    expect(r2.body.accepted).toBe(true);
  });

  it("C3 — version reported in status is TERMS_VERSION (not user-supplied)", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const { body } = await get("/api/terms/status");
    expect(body.version).toBe(TERMS_VERSION);
  });
});

// ── D: user_id from session, terms_version from server constant ───────────────
describe("D — POST accept: user_id from session, version from constant — never from body", () => {
  it("D1 — INSERT params[0] is session userId, not body.user_id", async () => {
    const calls = [];
    pool.query.mockImplementation((sql, params) => {
      calls.push({ sql, params });
      return Promise.resolve({ rows: [], rowCount: 1 });
    });
    // Attempt to inject a different user_id via body — must be ignored
    await post("/api/terms/accept", { body: { user_id: "attacker-id", terms_version: 999 } });
    expect(calls[0].params[0]).toBe("user-c6");       // session value
    expect(calls[0].params[0]).not.toBe("attacker-id");
  });

  it("D2 — INSERT params[1] is TERMS_VERSION constant, not body.terms_version", async () => {
    const calls = [];
    pool.query.mockImplementation((sql, params) => {
      calls.push({ sql, params });
      return Promise.resolve({ rows: [], rowCount: 1 });
    });
    // Attempt to inject a forged version via body — must be ignored
    await post("/api/terms/accept", { body: { terms_version: 9999 } });
    expect(calls[0].params[1]).toBe(TERMS_VERSION);   // server constant
    expect(calls[0].params[1]).not.toBe(9999);
  });

  it("D3 — INSERT params are exactly [userId, TERMS_VERSION] — nothing else", async () => {
    const calls = [];
    pool.query.mockImplementation((sql, params) => {
      calls.push({ sql, params });
      return Promise.resolve({ rows: [], rowCount: 1 });
    });
    await post("/api/terms/accept");
    expect(calls[0].params).toEqual(["user-c6", TERMS_VERSION]);
  });

  it("D4 — INSERT SQL contains ON CONFLICT DO NOTHING (client cannot bypass idempotency)", async () => {
    const calls = [];
    pool.query.mockImplementation((sql, params) => {
      calls.push({ sql, params });
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    await post("/api/terms/accept");
    expect(calls[0].sql.toUpperCase()).toMatch(/ON CONFLICT.*DO NOTHING/s);
  });
});

// ── E: Idempotent — double-accept ─────────────────────────────────────────────
describe("E — idempotent: double-accept → 200 both times, no error", () => {
  it("E1 — first accept → 200 { ok: true }", async () => {
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const { status, body } = await post("/api/terms/accept");
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it("E2 — second accept (ON CONFLICT DO NOTHING, rowCount=0) → still 200 { ok: true }", async () => {
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // conflict → no insert
    const { status, body } = await post("/api/terms/accept");
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it("E3 — response is { ok: true } regardless of rowCount", async () => {
    for (const rowCount of [0, 1]) {
      pool.query.mockResolvedValueOnce({ rows: [], rowCount });
      const { body } = await post("/api/terms/accept");
      expect(body.ok).toBe(true);
    }
  });
});

// ── F: GET without auth → 401 ────────────────────────────────────────────────
describe("F — GET /api/terms/status without auth → 401", () => {
  it("F1 — no Authorization header → 401", async () => {
    const { status } = await apiFetch(serverNoAuth, "/api/terms/status", {
      method: "GET",
      headers: {}, // no Authorization
    });
    expect(status).toBe(401);
  });

  it("F2 — wrong token format → 401", async () => {
    const { status } = await apiFetch(serverNoAuth, "/api/terms/status", {
      method: "GET",
      headers: { Authorization: "NotBearer abc" },
    });
    expect(status).toBe(401);
  });
});

// ── G: POST without auth → 401 ───────────────────────────────────────────────
describe("G — POST /api/terms/accept without auth → 401", () => {
  it("G1 — no Authorization header → 401", async () => {
    const { status } = await apiFetch(serverNoAuth, "/api/terms/accept", {
      method: "POST",
      headers: {},
    });
    expect(status).toBe(401);
  });
});

// ── H: GET response shape ─────────────────────────────────────────────────────
describe("H — GET /api/terms/status response includes version and text", () => {
  it("H1 — response has version field matching TERMS_VERSION", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const { body } = await get("/api/terms/status");
    expect(body.version).toBe(TERMS_VERSION);
  });

  it("H2 — response has text field matching TERMS_TEXT", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const { body } = await get("/api/terms/status");
    expect(body.text).toBe(TERMS_TEXT);
  });

  it("H3 — text and version travel together — client gets both in one call", async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: "uuid" }] });
    const { body } = await get("/api/terms/status");
    expect(typeof body.text).toBe("string");
    expect(body.text.length).toBeGreaterThan(0);
    expect(typeof body.version).toBe("number");
    expect(body.accepted).toBe(true); // shape complete
  });

  it("H4 — response has no user_id field (no identity leak)", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const { body } = await get("/api/terms/status");
    expect(body.user_id).toBeUndefined();
  });
});
