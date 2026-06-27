/**
 * c5.impact.test.js — GET /api/impact (C5.1)
 *
 * Test categories:
 *   A — aggregate count matches review_interactions truth
 *   B — direction-neutral: efficacy does not affect count
 *   C — consumption metric (journal entries) does not affect count
 *   D — auth guard: session-only, no /:userId param
 *   E — response never exposes helper identity
 *   F — zero impact → { total: 0, reports: [] }, not an error
 *   G — GET only, no write path
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import http    from "http";
import express from "express";

// ── Mocks (top-level, same pattern as c4.feed.test.js) ───────────────────────

vi.mock("../../security/claudeProxyShield.js", () => ({
  verifySession: (req, _res, next) => { req.userId = "user-aaa"; next(); },
}));

vi.mock("../../db.js", () => ({
  pool: { query: vi.fn() },
}));

import { pool }        from "../../db.js";
import impactRouter    from "../../routes/impact.js";

// ── Server setup ─────────────────────────────────────────────────────────────

let server;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", impactRouter);
  server = http.createServer(app);
  await new Promise(r => server.listen(0, "127.0.0.1", r));
});

afterAll(() => server.close());

beforeEach(() => { pool.query.mockReset(); });

// ── HTTP helper ───────────────────────────────────────────────────────────────

function apiFetch(path, opts = {}) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const options = {
      host: "127.0.0.1", port: addr.port,
      path, method: opts.method ?? "GET",
      headers: { "Content-Type": "application/json" },
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

// ── Helper: set up standard two-query mock (agg + breakdown) ─────────────────

function mockImpact({ total = 0, reports = [] } = {}) {
  pool.query
    .mockResolvedValueOnce({ rows: [{ total }] })
    .mockResolvedValueOnce({ rows: reports });
}

// ── A: Aggregate count ────────────────────────────────────────────────────────
describe("A — aggregate count matches review_interactions truth", () => {
  it("A1 — total = COUNT of helped-me marks on user's reports", async () => {
    mockImpact({ total: 7, reports: [] });
    const { body } = await apiFetch("/api/impact");
    expect(body.total).toBe(7);
  });

  it("A2 — per-report helped_count returned in reports array", async () => {
    mockImpact({
      total: 5,
      reports: [
        { review_id: "r-1", strain_name: "Blue Dream", helped_count: 4 },
        { review_id: "r-2", strain_name: "OG Kush",    helped_count: 1 },
      ],
    });
    const { body } = await apiFetch("/api/impact");
    expect(body.reports).toHaveLength(2);
    expect(body.reports[0].helped_count).toBe(4);
    expect(body.reports[1].helped_count).toBe(1);
  });

  it("A3 — aggregate SQL WHERE includes r.user_id param and is_seed = false", async () => {
    const calls = [];
    pool.query.mockImplementation((sql, params) => {
      calls.push({ sql, params });
      return Promise.resolve({ rows: [{ total: 0 }] });
    });
    await apiFetch("/api/impact");
    const aggSql = calls[0].sql;
    expect(aggSql).toMatch(/r\.user_id\s*=\s*\$1/i);
    expect(aggSql).toMatch(/is_seed\s*=\s*false/i);
  });

  it("A4 — breakdown SQL WHERE includes r.user_id param and is_seed = false", async () => {
    const calls = [];
    pool.query.mockImplementation((sql, params) => {
      calls.push({ sql, params });
      return Promise.resolve({ rows: [] });
    });
    await apiFetch("/api/impact");
    const breakSql = calls[1].sql;
    expect(breakSql).toMatch(/r\.user_id\s*=\s*\$1/i);
    expect(breakSql).toMatch(/is_seed\s*=\s*false/i);
  });

  it("A5 — user_id parameter passed to both queries", async () => {
    const calls = [];
    pool.query.mockImplementation((sql, params) => {
      calls.push({ sql, params });
      return Promise.resolve({ rows: [{ total: 0 }] });
    });
    await apiFetch("/api/impact");
    expect(calls[0].params[0]).toBe("user-aaa");
    expect(calls[1].params[0]).toBe("user-aaa");
  });
});

// ── B: Direction-neutral ──────────────────────────────────────────────────────
describe("B — direction-neutral: efficacy/rating not in impact SQL", () => {
  it("B1 — aggregate SQL does not reference efficacy", async () => {
    const calls = [];
    pool.query.mockImplementation((sql, params) => {
      calls.push({ sql, params });
      return Promise.resolve({ rows: [{ total: 0 }] });
    });
    await apiFetch("/api/impact");
    expect(calls[0].sql.toLowerCase()).not.toMatch(/efficacy/);
  });

  it("B2 — breakdown ORDER BY does not reference efficacy or rating", async () => {
    const calls = [];
    pool.query.mockImplementation((sql, params) => {
      calls.push({ sql, params });
      return Promise.resolve({ rows: [] });
    });
    await apiFetch("/api/impact");
    const afterOrderBy = (calls[1].sql.toLowerCase().split("order by")[1] ?? "");
    expect(afterOrderBy).not.toMatch(/efficacy/);
    expect(afterOrderBy).not.toMatch(/rating/);
  });

  it("B3 — only userId is passed as query param (no efficacy filter possible)", async () => {
    const calls = [];
    pool.query.mockImplementation((sql, params) => {
      calls.push({ sql, params });
      return Promise.resolve({ rows: [{ total: 0 }] });
    });
    await apiFetch("/api/impact");
    for (const { params } of calls) {
      expect(params).toEqual(["user-aaa"]);
    }
  });
});

// ── C: Consumption metric does not affect impact ──────────────────────────────
describe("C — consumption/journal metric does not affect impact count", () => {
  it("C1 — impact SQL does not reference treatment_journal", async () => {
    const calls = [];
    pool.query.mockImplementation((sql, params) => {
      calls.push({ sql, params });
      return Promise.resolve({ rows: [{ total: 0 }] });
    });
    await apiFetch("/api/impact");
    for (const { sql } of calls) {
      expect(sql.toLowerCase()).not.toMatch(/treatment_journal/);
    }
  });

  it("C2 — impact SQL does not reference streak, frequency, or journal", async () => {
    const calls = [];
    pool.query.mockImplementation((sql, params) => {
      calls.push({ sql, params });
      return Promise.resolve({ rows: [{ total: 0 }] });
    });
    await apiFetch("/api/impact");
    for (const { sql } of calls) {
      const s = sql.toLowerCase();
      expect(s).not.toMatch(/streak/);
      expect(s).not.toMatch(/frequency/);
      expect(s).not.toMatch(/journal/);
    }
  });

  it("C3 — aggregate query sources from review_interactions JOIN user_reviews", async () => {
    const calls = [];
    pool.query.mockImplementation((sql, params) => {
      calls.push({ sql, params });
      return Promise.resolve({ rows: [{ total: 0 }] });
    });
    await apiFetch("/api/impact");
    const aggSql = calls[0].sql.toLowerCase();
    expect(aggSql).toMatch(/review_interactions/);
    expect(aggSql).toMatch(/user_reviews/);
  });
});

// ── D: Auth guard — session-only, no :userId param ───────────────────────────
describe("D — auth guard: session-scoped only", () => {
  it("D1 — GET /api/impact returns 200 for authenticated user", async () => {
    mockImpact({ total: 3, reports: [] });
    const { status } = await apiFetch("/api/impact");
    expect(status).toBe(200);
  });

  it("D2 — GET /api/impact/:userId does not exist (404)", async () => {
    const { status } = await apiFetch("/api/impact/other-user-id");
    expect(status).toBe(404);
  });

  it("D3 — userId comes from session, query string userId param is ignored", async () => {
    const calls = [];
    pool.query.mockImplementation((sql, params) => {
      calls.push({ sql, params });
      return Promise.resolve({ rows: [{ total: 0 }] });
    });
    await apiFetch("/api/impact?userId=attacker-id");
    for (const { params } of calls) {
      expect(params[0]).toBe("user-aaa");      // session value
      expect(params[0]).not.toBe("attacker-id");
    }
  });
});

// ── E: No helper identity in response ────────────────────────────────────────
describe("E — response contains counts only, no identity", () => {
  it("E1 — response body has no user_id at top level", async () => {
    mockImpact({ total: 2, reports: [] });
    const { body } = await apiFetch("/api/impact");
    expect(body.user_id).toBeUndefined();
  });

  it("E2 — each report entry has no user_id field", async () => {
    mockImpact({
      total: 2,
      reports: [{ review_id: "r-1", strain_name: "Blue Dream", helped_count: 2 }],
    });
    const { body } = await apiFetch("/api/impact");
    expect(body.reports[0].user_id).toBeUndefined();
  });

  it("E3 — breakdown SQL does not SELECT ri.user_id (helper identity)", async () => {
    const calls = [];
    pool.query.mockImplementation((sql, params) => {
      calls.push({ sql, params });
      return Promise.resolve({ rows: [] });
    });
    await apiFetch("/api/impact");
    // The breakdown must never SELECT ri.user_id (who helped) — counts only
    expect(calls[1].sql).not.toMatch(/ri\.user_id/i);
  });
});

// ── F: Zero impact — clean empty state ───────────────────────────────────────
describe("F — zero impact returns clean response, not error", () => {
  it("F1 — total=0, reports=[] → status 200", async () => {
    mockImpact({ total: 0, reports: [] });
    const { status, body } = await apiFetch("/api/impact");
    expect(status).toBe(200);
    expect(body.total).toBe(0);
    expect(body.reports).toEqual([]);
  });

  it("F2 — aggregate returns empty rows → total defaults to 0", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })   // no rows from aggregate
      .mockResolvedValueOnce({ rows: [] });
    const { status, body } = await apiFetch("/api/impact");
    expect(status).toBe(200);
    expect(body.total).toBe(0);
  });
});

// ── G: No write path ─────────────────────────────────────────────────────────
describe("G — GET only, no write path exists on /api/impact", () => {
  it("G1 — POST /api/impact → 404", async () => {
    const { status } = await apiFetch("/api/impact", { method: "POST", body: {} });
    expect(status).toBe(404);
  });

  it("G2 — PUT /api/impact → 404", async () => {
    const { status } = await apiFetch("/api/impact", { method: "PUT", body: {} });
    expect(status).toBe(404);
  });

  it("G3 — PATCH /api/impact → 404", async () => {
    const { status } = await apiFetch("/api/impact", { method: "PATCH", body: {} });
    expect(status).toBe(404);
  });

  it("G4 — DELETE /api/impact → 404", async () => {
    const { status } = await apiFetch("/api/impact", { method: "DELETE" });
    expect(status).toBe(404);
  });
});
