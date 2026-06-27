/**
 * C4.3 — Community Feed + "Helped me" endpoints
 *
 * Pattern: http.createServer + native fetch + pool.query mock (not pool.connect —
 * feed routes are read-only and do not use transactions).
 *
 * Test categories:
 *   A. Anonymity      — no user_id in any feed item
 *   B. Ranking SQL    — ORDER BY never references helped_me_count / engagement
 *   C. Cold-start     — no/empty profile → trust-ranked SQL
 *   D. Established    — has indications → relevance_tier in ORDER BY
 *   E. Response shape — relevance_tier stripped from public response
 *   F. Seed filter    — is_seed=false in WHERE clause
 *   G. Helped-me ON   — first POST → { helped: true, count: 1 }
 *   H. Helped-me OFF  — unique violation → { helped: false, count: 0 }
 *   I. Review 404     — FK violation → 404
 *   J. Pagination     — limit/offset passed through to query
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import http    from "http";
import express from "express";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("../../security/claudeProxyShield.js", () => ({
  verifySession: (req, _res, next) => { req.userId = "user-c4-test"; next(); },
}));

vi.mock("../../db.js", () => ({
  pool: { query: vi.fn() },
}));

import { pool } from "../../db.js";
import feedRouter from "../../routes/feed.js";

// ── HTTP server ───────────────────────────────────────────────────────────────

let server;
let baseUrl;

beforeAll(() =>
  new Promise((resolve) => {
    const app = express();
    app.use(express.json());
    app.use("/api", feedRouter);
    server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  }),
);

afterAll(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => vi.clearAllMocks());

// ── Fixtures ──────────────────────────────────────────────────────────────────

// High trust, low helped count — should outrank LOW_TRUST in trust-ranked feed
const HIGH_TRUST_REVIEW = {
  id: "rev-high-trust", strain_id: "s1",
  strain_name: "OG Kush", genetics: "indica",
  target_indications: ["pain"],
  efficacy: 5, anxiety_triggered: false,
  pain_relief: null, sleep_quality: null, side_effects: [],
  trust_weight: 0.90, photo_url: null,
  created_at: "2026-06-01T00:00:00Z",
  helped_me_count: 1, user_helped: false,
};

// Low trust, high helped count — must NOT outrank HIGH_TRUST
const LOW_TRUST_REVIEW = {
  id: "rev-low-trust", strain_id: "s2",
  strain_name: "Blue Dream", genetics: "sativa",
  target_indications: ["anxiety"],
  efficacy: 4, anxiety_triggered: false,
  pain_relief: null, sleep_quality: null, side_effects: [],
  trust_weight: 0.20, photo_url: null,
  created_at: "2026-06-02T00:00:00Z",
  helped_me_count: 100, user_helped: false,
};

const NO_PROFILE     = { rows: [] };
const EMPTY_PROFILE  = { rows: [{ profile: { indications: [] } }] };
const WITH_PROFILE   = { rows: [{ profile: { indications: ["pain"] } }] };

// ── Helpers ───────────────────────────────────────────────────────────────────

function feedUrl(qs = "") { return `${baseUrl}/api/feed${qs}`; }
function helpUrl(id)      { return `${baseUrl}/api/feed/${id}/help`; }

// Capture all SQL queries passed to pool.query during a request
function captureQueries(profileRows, feedRows, extraRows = []) {
  const queries = [];
  pool.query.mockImplementation(async (sql, params) => {
    queries.push({ sql, params });
    if (/FROM user_dna_profiles/.test(sql)) return profileRows;
    if (/FROM user_reviews/.test(sql))      return { rows: feedRows };
    return { rows: extraRows };
  });
  return queries;
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. Anonymity
// ═══════════════════════════════════════════════════════════════════════════════

describe("A — anonymity: no user_id in feed response", () => {
  it("A1 — feed items contain no user_id field", async () => {
    captureQueries(NO_PROFILE, [HIGH_TRUST_REVIEW]);
    const res  = await fetch(feedUrl());
    const body = await res.json();

    expect(res.status).toBe(200);
    for (const item of body.feed) {
      expect(item).not.toHaveProperty("user_id");
    }
  });

  it("A2 — user_id not present even when SELECT would include it", async () => {
    captureQueries(NO_PROFILE, [
      { ...HIGH_TRUST_REVIEW, user_id: "should-be-stripped" },
    ]);
    const { feed } = await (await fetch(feedUrl())).json();
    // The DB response includes user_id; the route must strip or never SELECT it
    // (our SELECT doesn't include user_id — so it should never appear)
    for (const item of feed) {
      expect(item).not.toHaveProperty("user_id");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. Ranking SQL — helped_me_count / COUNT must never enter ORDER BY
// ═══════════════════════════════════════════════════════════════════════════════

describe("B — ranking: ORDER BY never references helped_me_count or COUNT(ri)", () => {
  it("B1 — cold-start ORDER BY clause does not mention helped_me_count", async () => {
    const queries = captureQueries(NO_PROFILE, [HIGH_TRUST_REVIEW]);
    await fetch(feedUrl());

    const feedSql    = queries.find(q => /ORDER BY/.test(q.sql))?.sql ?? "";
    const orderByClause = feedSql.split("ORDER BY")[1] ?? "";
    expect(orderByClause).not.toMatch(/helped_me_count/);
    expect(orderByClause).not.toMatch(/COUNT\(ri/i);
  });

  it("B2 — established-user ORDER BY clause does not mention helped_me_count", async () => {
    const queries = captureQueries(WITH_PROFILE, [HIGH_TRUST_REVIEW]);
    await fetch(feedUrl());

    const feedSql    = queries.find(q => /ORDER BY/.test(q.sql))?.sql ?? "";
    const orderByClause = feedSql.split("ORDER BY")[1] ?? "";
    expect(orderByClause).not.toMatch(/helped_me_count/);
    expect(orderByClause).not.toMatch(/COUNT\(ri/i);
  });

  it("B3 — helped_me_count appears in SELECT (display) but not in ORDER BY", async () => {
    const queries = captureQueries(NO_PROFILE, [HIGH_TRUST_REVIEW]);
    await fetch(feedUrl());

    const feedSql = queries.find(q => /SELECT/.test(q.sql) && /FROM user_reviews/.test(q.sql))?.sql ?? "";
    expect(feedSql).toMatch(/helped_me_count/);          // present in SELECT (display)
    const orderByClause = feedSql.split("ORDER BY")[1] ?? "";
    expect(orderByClause).not.toMatch(/helped_me_count/); // absent from ORDER BY
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. Cold-start — no/empty profile → trust-ranked SQL
// ═══════════════════════════════════════════════════════════════════════════════

describe("C — cold-start: no profile or empty indications → trust_weight ORDER BY", () => {
  it("C1 — no DNA profile row → ORDER BY trust_weight", async () => {
    const queries = captureQueries(NO_PROFILE, []);
    await fetch(feedUrl());

    const feedSql = queries.find(q => /ORDER BY/.test(q.sql))?.sql ?? "";
    expect(feedSql).toMatch(/ORDER BY r\.trust_weight DESC/);
  });

  it("C2 — empty indications → same trust-ranked path as no profile", async () => {
    const queries = captureQueries(EMPTY_PROFILE, []);
    await fetch(feedUrl());

    const feedSql = queries.find(q => /ORDER BY/.test(q.sql))?.sql ?? "";
    expect(feedSql).toMatch(/ORDER BY r\.trust_weight DESC/);
    expect(feedSql).not.toMatch(/relevance_tier/);
  });

  it("C3 — trust-ranked path does not pass indications array to DB", async () => {
    const queries = captureQueries(NO_PROFILE, []);
    await fetch(feedUrl());

    const feedQuery = queries.find(q => /FROM user_reviews/.test(q.sql));
    // Cold-start path: no indications (those only appear in the established path).
    // categories may appear as an array param (category filter is separate from indication ranking).
    const arrayParams = (feedQuery?.params ?? []).filter(p => Array.isArray(p));
    // At most one array param (categories); must NOT contain a multi-element indications array
    // (indications are only passed in the established path with relevance_tier).
    const hasIndicationsParam = arrayParams.some(p => p.length > 1);
    expect(hasIndicationsParam).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. Established user — has indications → relevance_tier in ORDER BY
// ═══════════════════════════════════════════════════════════════════════════════

describe("D — established user: indications present → relevance-ranked SQL", () => {
  it("D1 — relevance_tier appears in SELECT and first in ORDER BY", async () => {
    const queries = captureQueries(WITH_PROFILE, []);
    await fetch(feedUrl());

    const feedSql = queries.find(q => /FROM user_reviews/.test(q.sql))?.sql ?? "";
    expect(feedSql).toMatch(/relevance_tier/);
    expect(feedSql).toMatch(/ORDER BY relevance_tier DESC, r\.trust_weight DESC/);
  });

  it("D2 — within relevance path, trust_weight is secondary sort key", async () => {
    const queries = captureQueries(WITH_PROFILE, []);
    await fetch(feedUrl());

    const orderBy = queries.find(q => /ORDER BY/.test(q.sql))?.sql.split("ORDER BY")[1] ?? "";
    expect(orderBy).toMatch(/relevance_tier DESC.*trust_weight DESC/);
  });

  it("D3 — indications array is passed as a DB parameter", async () => {
    const queries = captureQueries(WITH_PROFILE, []);
    await fetch(feedUrl());

    const feedQuery = queries.find(q => /FROM user_reviews/.test(q.sql));
    const hasArrayParam = feedQuery?.params?.some(p => Array.isArray(p));
    expect(hasArrayParam).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E. relevance_tier stripped from public response
// ═══════════════════════════════════════════════════════════════════════════════

describe("E — relevance_tier not exposed in API response", () => {
  it("E1 — feed items have no relevance_tier field (established path)", async () => {
    captureQueries(WITH_PROFILE, [
      { ...HIGH_TRUST_REVIEW, relevance_tier: 1 },
    ]);
    const { feed } = await (await fetch(feedUrl())).json();
    for (const item of feed) {
      expect(item).not.toHaveProperty("relevance_tier");
    }
  });

  it("E2 — feed items have no relevance_tier field (cold-start path)", async () => {
    captureQueries(NO_PROFILE, [HIGH_TRUST_REVIEW]);
    const { feed } = await (await fetch(feedUrl())).json();
    for (const item of feed) {
      expect(item).not.toHaveProperty("relevance_tier");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F. Seed filter
// ═══════════════════════════════════════════════════════════════════════════════

describe("F — is_seed=false in feed WHERE clause", () => {
  it("F1 — cold-start SQL contains is_seed = false filter", async () => {
    const queries = captureQueries(NO_PROFILE, []);
    await fetch(feedUrl());

    const feedSql = queries.find(q => /FROM user_reviews/.test(q.sql))?.sql ?? "";
    expect(feedSql).toMatch(/is_seed\s*=\s*false/i);
  });

  it("F2 — established-user SQL also contains is_seed = false filter", async () => {
    const queries = captureQueries(WITH_PROFILE, []);
    await fetch(feedUrl());

    const feedSql = queries.find(q => /FROM user_reviews/.test(q.sql))?.sql ?? "";
    expect(feedSql).toMatch(/is_seed\s*=\s*false/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G. "Helped me" toggle ON — first POST → { helped: true, count }
// ═══════════════════════════════════════════════════════════════════════════════

describe("G — helped-me toggle ON: INSERT succeeds → helped=true", () => {
  it("G1 — returns { helped: true, count: 1 }", async () => {
    pool.query.mockResolvedValueOnce({})                    // INSERT
              .mockResolvedValueOnce({ rows: [{ count: 1 }] }); // SELECT COUNT

    const res  = await fetch(helpUrl("rev-abc"), { method: "POST" });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.helped).toBe(true);
    expect(body.count).toBe(1);
  });

  it("G2 — INSERT SQL targets review_interactions", async () => {
    const queries = [];
    pool.query.mockImplementation(async (sql, params) => {
      queries.push({ sql, params });
      return { rows: [{ count: 1 }] };
    });
    await fetch(helpUrl("rev-abc"), { method: "POST" });

    const insert = queries.find(q => /INSERT/.test(q.sql));
    expect(insert?.sql).toMatch(/review_interactions/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// H. "Helped me" toggle OFF — unique violation → { helped: false, count }
// ═══════════════════════════════════════════════════════════════════════════════

describe("H — helped-me toggle OFF: unique violation → helped=false", () => {
  it("H1 — returns { helped: false, count: 0 }", async () => {
    const uniqueErr = Object.assign(new Error("dup"), { code: "23505" });
    pool.query.mockRejectedValueOnce(uniqueErr)              // INSERT throws
              .mockResolvedValueOnce({})                     // DELETE
              .mockResolvedValueOnce({ rows: [{ count: 0 }] }); // COUNT

    const res  = await fetch(helpUrl("rev-abc"), { method: "POST" });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.helped).toBe(false);
    expect(body.count).toBe(0);
  });

  it("H2 — DELETE targets review_interactions on toggle-off", async () => {
    const uniqueErr = Object.assign(new Error("dup"), { code: "23505" });
    const queries = [];
    pool.query.mockImplementationOnce(() => Promise.reject(uniqueErr))
              .mockImplementation(async (sql, params) => {
                queries.push({ sql, params });
                return { rows: [{ count: 0 }] };
              });

    await fetch(helpUrl("rev-abc"), { method: "POST" });

    const del = queries.find(q => /^DELETE/.test(q.sql.trim()));
    expect(del?.sql).toMatch(/review_interactions/);
  });

  it("H3 — COUNT is re-queried after toggle (reflects actual state)", async () => {
    const uniqueErr = Object.assign(new Error("dup"), { code: "23505" });
    const queries = [];
    pool.query.mockRejectedValueOnce(uniqueErr)
              .mockImplementation(async (sql, params) => {
                queries.push({ sql, params });
                return { rows: [{ count: 5 }] };
              });

    const { count } = await (await fetch(helpUrl("rev-abc"), { method: "POST" })).json();
    const countQuery = queries.find(q => /COUNT/.test(q.sql));
    expect(countQuery).toBeDefined();
    expect(count).toBe(5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// I. Review not found → 404
// ═══════════════════════════════════════════════════════════════════════════════

describe("I — helped-me on non-existent review → 404", () => {
  it("I1 — FK violation (23503) → 404", async () => {
    const fkErr = Object.assign(new Error("fk"), { code: "23503" });
    pool.query.mockRejectedValueOnce(fkErr);

    const res = await fetch(helpUrl("no-such-review"), { method: "POST" });
    expect(res.status).toBe(404);
  });

  it("I2 — 404 body is informative", async () => {
    const fkErr = Object.assign(new Error("fk"), { code: "23503" });
    pool.query.mockRejectedValueOnce(fkErr);

    const body = await (await fetch(helpUrl("no-such-review"), { method: "POST" })).json();
    expect(body.error).toBeDefined();
    expect(typeof body.error.message).toBe("string");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// J. Pagination
// ═══════════════════════════════════════════════════════════════════════════════

describe("J — pagination params forwarded to DB query", () => {
  it("J1 — limit and offset appear in feed query params", async () => {
    const queries = captureQueries(NO_PROFILE, []);
    await fetch(feedUrl("?limit=5&offset=10"));

    const feedQuery = queries.find(q => /FROM user_reviews/.test(q.sql));
    expect(feedQuery?.params[0]).toBe(5);   // limit
    expect(feedQuery?.params[1]).toBe(10);  // offset
  });

  it("J2 — limit is capped at 50", async () => {
    const queries = captureQueries(NO_PROFILE, []);
    await fetch(feedUrl("?limit=999"));

    const feedQuery = queries.find(q => /FROM user_reviews/.test(q.sql));
    expect(feedQuery?.params[0]).toBeLessThanOrEqual(50);
  });
});
