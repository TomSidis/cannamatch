/**
 * journal.treatment.getpatch.test.js — HTTP tests for GET + PATCH /api/journal/treatment (C2.3)
 *
 * Tests:
 *   A. GET /treatment — returns own entries, paginated, includes notes
 *   B. GET /treatment — route ordering (not matched by /:userId param route)
 *   C. PATCH /treatment/:id — updates effects/side_effects on own entry
 *   D. PATCH ownership guard — 404 (NOT 403) for other user's entry
 *   E. PATCH ownership guard — 404 for non-existent entry
 *   F. PATCH unknown effect IDs → warn + filter (same as POST)
 *   G. PATCH does NOT update notes/photo_url/rating (immutable via this endpoint)
 *   H. PATCH "other" sentinel stripped from array, text goes to side_effects_other
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import http    from "http";
import express from "express";

vi.mock("../../security/claudeProxyShield.js", () => ({
  verifySession: (req, _res, next) => {
    req.userId = "test-user-c2-get";
    next();
  },
}));

vi.mock("../../db.js", () => ({
  pool: { connect: vi.fn(), query: vi.fn() },
}));

import { pool }      from "../../db.js";
import journalRouter from "../../routes/journal.js";

let server;
let baseUrl;

beforeAll(
  () =>
    new Promise((resolve) => {
      const app = express();
      app.use(express.json());
      app.use("/api/journal", journalRouter);
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

const ENTRY_ID  = "tj-owned-001";
const STRAIN_ID = "550e8400-e29b-41d4-a716-446655440001";

const SAMPLE_ENTRY = {
  id:                 ENTRY_ID,
  strain_id:          STRAIN_ID,
  strain_name:        "Blue Dream",
  grow_batch_id:      null,
  rating:             4,
  photo_url:          null,
  notes:              "הרגשתי טוב מאוד",
  effects:            ["sleep", "mood"],
  side_effects:       ["dry_mouth"],
  side_effects_other: null,
  created_at:         new Date("2026-06-25T10:00:00Z"),
};

const UPDATED_ENTRY = {
  id:                 ENTRY_ID,
  effects:            ["sleep", "antiPain"],
  side_effects:       ["dry_mouth", "foggy"],
  side_effects_other: null,
  created_at:         new Date("2026-06-25T10:00:00Z"),
};

// ── A. GET /treatment ─────────────────────────────────────────────────────────
describe("A — GET /treatment returns own entries", () => {
  it("returns 200 with entries array and count", async () => {
    pool.query = vi.fn().mockResolvedValue({ rows: [SAMPLE_ENTRY] });

    const res = await fetch(`${baseUrl}/api/journal/treatment`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(1);
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].id).toBe(ENTRY_ID);
  });

  it("returns empty list when user has no entries", async () => {
    pool.query = vi.fn().mockResolvedValue({ rows: [] });

    const res = await fetch(`${baseUrl}/api/journal/treatment`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(0);
    expect(body.entries).toEqual([]);
  });

  it("includes notes in own entries (user reads their private data)", async () => {
    pool.query = vi.fn().mockResolvedValue({ rows: [SAMPLE_ENTRY] });

    const res = await fetch(`${baseUrl}/api/journal/treatment`);
    const body = await res.json();
    expect(body.entries[0].notes).toBe("הרגשתי טוב מאוד");
  });

  it("SQL query filters by req.userId (no cross-user leak at DB level)", async () => {
    pool.query = vi.fn().mockResolvedValue({ rows: [] });

    await fetch(`${baseUrl}/api/journal/treatment`);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/WHERE j\.user_id = \$1/);
    expect(params[0]).toBe("test-user-c2-get"); // session userId, not a param
  });

  it("respects limit and offset query params", async () => {
    pool.query = vi.fn().mockResolvedValue({ rows: [] });

    await fetch(`${baseUrl}/api/journal/treatment?limit=10&offset=20`);

    const [, params] = pool.query.mock.calls[0];
    expect(params[1]).toBe(10);  // limit
    expect(params[2]).toBe(20);  // offset
  });

  it("caps limit at 200 even if higher value is requested", async () => {
    pool.query = vi.fn().mockResolvedValue({ rows: [] });

    await fetch(`${baseUrl}/api/journal/treatment?limit=999`);

    const [, params] = pool.query.mock.calls[0];
    expect(params[1]).toBe(200);
  });
});

// ── B. Route ordering — /treatment not absorbed by /:userId ─────────────────
describe("B — route ordering: GET /treatment is not matched by /:userId", () => {
  it("GET /treatment returns 200 (not routed as /:userId='treatment')", async () => {
    pool.query = vi.fn().mockResolvedValue({ rows: [] });

    const res = await fetch(`${baseUrl}/api/journal/treatment`);
    // If route ordering is wrong, this would hit bio_journal GET /:userId
    // and query bio_journal with user_id='treatment' — wrong table, wrong result.
    // Verify the correct query is made (treatment_journal, not bio_journal).
    expect(res.status).toBe(200);
    const [sql] = pool.query.mock.calls[0];
    expect(sql).toContain("treatment_journal");
    expect(sql).not.toContain("bio_journal");
  });
});

// ── C. PATCH — updates effects/side_effects on own entry ─────────────────────
describe("C — PATCH updates effects and side_effects on own entry", () => {
  function setupPatchClient({ owned = true } = {}) {
    const client = {
      query: vi.fn(async (sql) => {
        if (/BEGIN/.test(sql))    return {};
        if (/COMMIT/.test(sql))   return {};
        if (/ROLLBACK/.test(sql)) return {};
        if (/SELECT id FROM treatment_journal/.test(sql)) {
          return { rows: owned ? [{ id: ENTRY_ID }] : [] };
        }
        if (/UPDATE treatment_journal/.test(sql)) {
          return { rows: [UPDATED_ENTRY] };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    pool.connect.mockResolvedValue(client);
    return client;
  }

  it("returns 200 with updated effects on own entry", async () => {
    setupPatchClient({ owned: true });

    const res = await fetch(`${baseUrl}/api/journal/treatment/${ENTRY_ID}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ effects: ["sleep", "antiPain"], side_effects: ["dry_mouth", "foggy"] }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.effects).toEqual(["sleep", "antiPain"]);
  });

  it("passes effects through closed-list filter before UPDATE", async () => {
    const client = setupPatchClient({ owned: true });

    await fetch(`${baseUrl}/api/journal/treatment/${ENTRY_ID}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ effects: ["sleep", "invented"], side_effects: [] }),
    });

    const updateCall = client.query.mock.calls.find(([sql]) =>
      /UPDATE treatment_journal/.test(sql),
    );
    expect(updateCall[1][0]).toEqual(["sleep"]); // "invented" stripped
    expect(updateCall[1][1]).toBeNull();          // empty side_effects → null
  });
});

// ── D. PATCH ownership guard — other user's entry → 404 not 403 ──────────────
describe("D — PATCH ownership guard returns 404 (not 403) for another user's entry", () => {
  it("returns 404 when entry belongs to a different user", async () => {
    const client = {
      query: vi.fn(async (sql) => {
        if (/BEGIN/.test(sql))    return {};
        if (/ROLLBACK/.test(sql)) return {};
        // Ownership check: entry exists but user_id doesn't match → empty rows
        if (/SELECT id FROM treatment_journal/.test(sql)) return { rows: [] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    pool.connect.mockResolvedValue(client);

    const res = await fetch(`${baseUrl}/api/journal/treatment/some-other-users-entry`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ effects: ["sleep"] }),
    });

    expect(res.status).toBe(404);              // NOT 403 — must not reveal entry existence
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(res.status).not.toBe(403);
  });
});

// ── E. PATCH ownership guard — non-existent entry → 404 ─────────────────────
describe("E — PATCH returns 404 for non-existent entry id", () => {
  it("returns 404 when entry id does not exist", async () => {
    const client = {
      query: vi.fn(async (sql) => {
        if (/BEGIN/.test(sql))    return {};
        if (/ROLLBACK/.test(sql)) return {};
        if (/SELECT id FROM treatment_journal/.test(sql)) return { rows: [] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    pool.connect.mockResolvedValue(client);

    const res = await fetch(`${baseUrl}/api/journal/treatment/00000000-0000-0000-0000-000000000000`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ effects: ["mood"] }),
    });

    expect(res.status).toBe(404);
  });

  it("404 body shape is identical for non-existent vs other-user entry (no info leak)", async () => {
    const makeClient = () => {
      const c = {
        query: vi.fn(async (sql) => {
          if (/BEGIN/.test(sql) || /ROLLBACK/.test(sql)) return {};
          if (/SELECT id FROM treatment_journal/.test(sql)) return { rows: [] };
          return { rows: [] };
        }),
        release: vi.fn(),
      };
      pool.connect.mockResolvedValue(c);
      return c;
    };

    makeClient();
    const res1 = await fetch(`${baseUrl}/api/journal/treatment/nonexistent-id`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body:   JSON.stringify({ effects: ["sleep"] }),
    });
    const body1 = await res1.json();

    makeClient();
    const res2 = await fetch(`${baseUrl}/api/journal/treatment/other-users-id`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body:   JSON.stringify({ effects: ["sleep"] }),
    });
    const body2 = await res2.json();

    // Both cases: same status, same message structure
    expect(res1.status).toBe(404);
    expect(res2.status).toBe(404);
    expect(body1.error.message).toBe(body2.error.message);
  });
});

// ── F. PATCH unknown effect IDs → warn + filter ───────────────────────────────
describe("F — PATCH unknown effect IDs are warned and filtered (same as POST)", () => {
  it("logs console.warn when PATCH receives unknown effect IDs", async () => {
    const client = {
      query: vi.fn(async (sql) => {
        if (/BEGIN/.test(sql))    return {};
        if (/COMMIT/.test(sql))   return {};
        if (/ROLLBACK/.test(sql)) return {};
        if (/SELECT id FROM treatment_journal/.test(sql)) return { rows: [{ id: ENTRY_ID }] };
        if (/UPDATE treatment_journal/.test(sql)) return { rows: [UPDATED_ENTRY] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    pool.connect.mockResolvedValue(client);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await fetch(`${baseUrl}/api/journal/treatment/${ENTRY_ID}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ effects: ["sleep", "invented_effect"] }),
    });

    expect(warnSpy).toHaveBeenCalledOnce();
    const [msg] = warnSpy.mock.calls[0];
    expect(msg).toContain("[journal] unknown-effect-ids");
    warnSpy.mockRestore();
  });
});

// ── G. PATCH does NOT update notes/photo_url/rating ──────────────────────────
describe("G — PATCH only updates effects fields (notes/photo_url/rating are immutable)", () => {
  it("UPDATE SQL does not set notes, photo_url, or rating columns", async () => {
    const client = {
      query: vi.fn(async (sql) => {
        if (/BEGIN/.test(sql))    return {};
        if (/COMMIT/.test(sql))   return {};
        if (/ROLLBACK/.test(sql)) return {};
        if (/SELECT id FROM treatment_journal/.test(sql)) return { rows: [{ id: ENTRY_ID }] };
        if (/UPDATE treatment_journal/.test(sql)) return { rows: [UPDATED_ENTRY] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    pool.connect.mockResolvedValue(client);

    await fetch(`${baseUrl}/api/journal/treatment/${ENTRY_ID}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      // Attacker tries to update notes and rating via PATCH
      body:    JSON.stringify({
        effects: ["sleep"],
        notes:   "ניסיון לשנות הערה",
        rating:  1,
        photo_url: "https://evil.com/photo.jpg",
      }),
    });

    const updateCall = client.query.mock.calls.find(([sql]) =>
      /UPDATE treatment_journal/.test(sql),
    );
    expect(updateCall).toBeDefined();
    const [sql] = updateCall;
    expect(sql).not.toMatch(/notes\s*=/);
    expect(sql).not.toMatch(/photo_url\s*=/);
    expect(sql).not.toMatch(/rating\s*=/);
  });
});

// ── H. PATCH "other" sentinel handling ───────────────────────────────────────
describe("H — PATCH 'other' sentinel stripped from array, free text to side_effects_other", () => {
  it("strips 'other' from side_effects array and stores free text separately", async () => {
    const client = {
      query: vi.fn(async (sql) => {
        if (/BEGIN/.test(sql))    return {};
        if (/COMMIT/.test(sql))   return {};
        if (/ROLLBACK/.test(sql)) return {};
        if (/SELECT id FROM treatment_journal/.test(sql)) return { rows: [{ id: ENTRY_ID }] };
        if (/UPDATE treatment_journal/.test(sql)) return { rows: [UPDATED_ENTRY] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    pool.connect.mockResolvedValue(client);

    await fetch(`${baseUrl}/api/journal/treatment/${ENTRY_ID}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        side_effects:       ["dry_mouth", "other", "headache"],
        side_effects_other: "כאב גרון קל",
      }),
    });

    const updateCall = client.query.mock.calls.find(([sql]) =>
      /UPDATE treatment_journal/.test(sql),
    );
    const params = updateCall[1];
    expect(params[1]).not.toContain("other");   // stripped from array
    expect(params[1]).toContain("dry_mouth");
    expect(params[1]).toContain("headache");
    expect(params[2]).toContain("כאב גרון קל"); // in side_effects_other column
  });
});
