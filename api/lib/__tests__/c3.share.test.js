/**
 * C3 — Share/Unshare endpoints
 *
 * Pattern matches C2 tests: http.createServer + native fetch + sql-regex mocks.
 *
 * Test categories:
 *   A. Privacy invariants (notes/side_effects_other never in INSERT params)
 *   B. Share flow (creates review; journal unchanged)
 *   C. Unshare flow (removes review; journal unchanged)
 *   D. Ownership guards (404 not 403 — no info leak)
 *   E. Anonymity (no user_id / journal_entry_id in response)
 *   F. Trust computation (computeReportWeight called; grow_batch_id=null OK)
 *   G. Idempotency (second share → same review_id, no second INSERT)
 *   H. License gate (verified+expired → 403, no INSERT)
 *   I. Schema-aware payload validation (INSERT params pass DB CHECK constraints)
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import http    from "http";
import express from "express";

// ── Mocks (must appear before any import of mocked modules) ───────────────────

vi.mock("../../security/claudeProxyShield.js", () => ({
  verifySession: (req, _res, next) => { req.userId = "user-c3-test"; next(); },
}));

const mockComputeWeight = vi.fn(() => 0.60);
vi.mock("../../../src/engine/reportTrust.ts", () => ({
  computeReportWeight: (...args) => mockComputeWeight(...args),
}));

const mockLicenseGate = vi.fn(() => ({ blocked: false, warning: null }));
vi.mock("../../lib/licenseExpiry.js", () => ({
  checkLicenseGate: (...args) => mockLicenseGate(...args),
}));

vi.mock("../../lib/anomalyHooks.js", () => ({
  aggregateAnomalyScore: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock("../../lib/dnaProfile.js", () => ({
  DEFAULT_DNA:           {},
  updateDNAFromJournal:  vi.fn(() => ({})),
  updateUserDNAProfile:  vi.fn(() => ({})),
}));

vi.mock("../../constants.js", () => ({ DEFAULT_DNA: {} }));

vi.mock("../../db.js", () => ({
  pool: { connect: vi.fn(), query: vi.fn() },
}));

import { pool }       from "../../db.js";
import journalRouter  from "../../routes/journal.js";

// ── HTTP server setup ─────────────────────────────────────────────────────────

let server;
let baseUrl;

beforeAll(() =>
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

beforeEach(() => {
  vi.clearAllMocks();
  mockComputeWeight.mockReturnValue(0.60);
  mockLicenseGate.mockReturnValue({ blocked: false, warning: null });
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

// This entry has notes + side_effects_other — they MUST NEVER reach the INSERT.
const JOURNAL_ENTRY = {
  id:                 "jid-c3",
  user_id:            "user-c3-test",
  strain_id:          "strain-xyz",
  rating:             4,
  grow_batch_id:      null,
  photo_url:          null,
  notes:              "private note — must not leak",
  effects:            ["antiPain", "mood"],
  side_effects:       ["dizzy"],
  side_effects_other: "private detail — must not leak",
  created_at:         "2026-06-25T10:00:00Z",
};

const USER_ROW_UNVERIFIED = { license_verified: false, license_expiry: null };
const USER_ROW_VERIFIED   = { license_verified: true,  license_expiry: null };
const NEW_REVIEW          = { id: "rev-c3", trust_weight: 0.60 };

// ── Client mock factory ───────────────────────────────────────────────────────
// Tracks INSERT params so tests can run assertFitsSchema on the actual values.

let capturedInsertParams = null;

function makeClient({
  entry         = JOURNAL_ENTRY,
  userRow       = USER_ROW_UNVERIFIED,
  existingReview = null,   // non-null → idempotency path (already shared)
  reviewForDelete = null,  // non-null → unshare ownership passes
  newReview     = NEW_REVIEW,
} = {}) {
  capturedInsertParams = null;

  return {
    release: vi.fn(),
    query: vi.fn(async (sql, _params) => {
      if (/^BEGIN/.test(sql.trim()))    return {};
      if (/^COMMIT/.test(sql.trim()))   return {};
      if (/^ROLLBACK/.test(sql.trim())) return {};

      // Share: ownership guard on treatment_journal
      if (/FROM treatment_journal/.test(sql)) {
        return { rows: entry ? [entry] : [] };
      }

      // License gate: SELECT users
      if (/FROM users WHERE/.test(sql)) {
        return { rows: userRow ? [userRow] : [] };
      }

      // Idempotency check: SELECT from user_reviews by journal_entry_id only
      if (/FROM user_reviews/.test(sql) && !/user_id/.test(sql.split("WHERE")[1] ?? "")) {
        return { rows: existingReview ? [existingReview] : [] };
      }

      // Unshare ownership guard: SELECT from user_reviews with user_id
      if (/FROM user_reviews/.test(sql) && /user_id/.test(sql.split("WHERE")[1] ?? "")) {
        return { rows: reviewForDelete ? [reviewForDelete] : [] };
      }

      // Batch cross-reference
      if (/FROM grow_batch/.test(sql)) return { rows: [] };

      // INSERT into user_reviews — capture params for schema assertions
      if (/INSERT INTO user_reviews/.test(sql)) {
        capturedInsertParams = _params;
        return { rows: [newReview] };
      }

      // DELETE (unshare)
      if (/^DELETE FROM user_reviews/.test(sql.trim())) return {};

      return { rows: [] };
    }),
  };
}

// ── Schema-aware validator (mirrors DB CHECK constraints from schema.sql) ─────
const SCHEMA = {
  efficacy:      { min: 1, max: 5, nullable: false },
  pain_relief:   { min: 1, max: 5, nullable: true  },
  sleep_quality: { min: 1, max: 5, nullable: true  },
};

function assertInsertFitsSchema(params) {
  // INSERT param positions (0-indexed): $1=user_id $2=strain_id $3=efficacy
  // $4=anxiety_triggered $5=pain_relief $6=sleep_quality ...
  const payload = { efficacy: params[2], pain_relief: params[4], sleep_quality: params[5] };
  for (const [field, c] of Object.entries(SCHEMA)) {
    const val = payload[field];
    if (val === null || val === undefined) {
      if (!c.nullable) throw new Error(`Schema violation: ${field} is NOT NULL but got ${val}`);
      continue;
    }
    if (typeof val !== "number" || val < c.min || val > c.max)
      throw new Error(`Schema violation: ${field}=${val} violates CHECK BETWEEN ${c.min} AND ${c.max}`);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function shareUrl(id = "jid-c3") { return `${baseUrl}/api/journal/treatment/${id}/share`; }

async function doShare(id = "jid-c3") {
  return fetch(shareUrl(id), { method: "POST", headers: { "Content-Type": "application/json" } });
}
async function doUnshare(id = "jid-c3") {
  return fetch(shareUrl(id), { method: "DELETE" });
}

// ═════════════════════════════════════════════════════════════════════════════
// A. Privacy invariants
// ═════════════════════════════════════════════════════════════════════════════

describe("A — privacy: notes and side_effects_other never reach user_reviews INSERT", () => {
  it("A1 — INSERT params contain neither the notes string nor side_effects_other string", async () => {
    pool.connect.mockResolvedValue(makeClient());
    await doShare();

    expect(capturedInsertParams).not.toBeNull();
    const asJson = JSON.stringify(capturedInsertParams);
    expect(asJson).not.toContain("must not leak");
    expect(asJson).not.toContain("private note");
    expect(asJson).not.toContain("private detail");
  });

  it("A2 — pain_relief and sleep_quality are null even when antiPain/sleep in effects", async () => {
    pool.connect.mockResolvedValue(makeClient({
      entry: { ...JOURNAL_ENTRY, effects: ["antiPain", "sleep"] },
    }));
    await doShare();
    expect(capturedInsertParams[4]).toBeNull(); // pain_relief ($5)
    expect(capturedInsertParams[5]).toBeNull(); // sleep_quality ($6)
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// B. Share flow
// ═════════════════════════════════════════════════════════════════════════════

describe("B — share creates community review; journal entry unchanged", () => {
  it("B1 — returns 200 with status=ok, review_id, trust_weight", async () => {
    pool.connect.mockResolvedValue(makeClient());
    const res  = await doShare();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.review_id).toBe("rev-c3");
    expect(typeof body.trust_weight).toBe("number");
  });

  it("B2 — no UPDATE to treatment_journal during share", async () => {
    const client = makeClient();
    pool.connect.mockResolvedValue(client);
    await doShare();

    const queryCalls = client.query.mock.calls;
    const updateJournal = queryCalls.find(
      ([sql]) => typeof sql === "string" && /UPDATE treatment_journal/.test(sql),
    );
    expect(updateJournal).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// C. Unshare flow
// ═════════════════════════════════════════════════════════════════════════════

describe("C — unshare removes review; journal entry unchanged", () => {
  it("C1 — returns 204 on successful unshare", async () => {
    pool.connect.mockResolvedValue(makeClient({ reviewForDelete: { id: "rev-del" } }));
    const res = await doUnshare();
    expect(res.status).toBe(204);
  });

  it("C2 — DELETE targets user_reviews, not treatment_journal", async () => {
    const client = makeClient({ reviewForDelete: { id: "rev-del" } });
    pool.connect.mockResolvedValue(client);
    await doUnshare();

    const deleteCalls = client.query.mock.calls.filter(
      ([sql]) => typeof sql === "string" && /^DELETE/.test(sql.trim()),
    );
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0][0]).toContain("user_reviews");
    expect(deleteCalls[0][0]).not.toContain("treatment_journal");
  });

  it("C3 — no UPDATE or DELETE on treatment_journal during unshare", async () => {
    const client = makeClient({ reviewForDelete: { id: "rev-del" } });
    pool.connect.mockResolvedValue(client);
    await doUnshare();

    const touchedJournal = client.query.mock.calls.some(
      ([sql]) =>
        typeof sql === "string" &&
        /treatment_journal/.test(sql) &&
        (/^UPDATE/.test(sql.trim()) || /^DELETE/.test(sql.trim())),
    );
    expect(touchedJournal).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// D. Ownership guards — 404, same body regardless of reason
// ═════════════════════════════════════════════════════════════════════════════

describe("D — ownership guards: 404 (not 403) — no information leak", () => {
  it("D1 — POST share with another user's journal entry → 404", async () => {
    pool.connect.mockResolvedValue(makeClient({ entry: null }));
    const res = await doShare("other-journal-id");
    expect(res.status).toBe(404);
  });

  it("D2 — POST share with non-existent id → same 404 body as D1", async () => {
    pool.connect.mockResolvedValue(makeClient({ entry: null }));
    const res  = await doShare("nonexistent");
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.error.message).toBe("רשומה לא נמצאה.");
  });

  it("D3 — DELETE unshare with other user's review → 404", async () => {
    pool.connect.mockResolvedValue(makeClient({ reviewForDelete: null }));
    const res = await doUnshare("other-journal");
    expect(res.status).toBe(404);
  });

  it("D4 — D1 and D2 return identical body (no information leak)", async () => {
    pool.connect.mockResolvedValue(makeClient({ entry: null }));
    const r1 = await (await doShare("other-user-journal")).json();

    pool.connect.mockResolvedValue(makeClient({ entry: null }));
    const r2 = await (await doShare("nonexistent-journal")).json();

    expect(r1).toEqual(r2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// E. Anonymity — response body has no identifying fields
// ═════════════════════════════════════════════════════════════════════════════

describe("E — anonymity: response has no user_id or journal_entry_id", () => {
  it("E1 — response body has no 'user_id' field", async () => {
    pool.connect.mockResolvedValue(makeClient());
    const body = await (await doShare()).json();
    expect(body).not.toHaveProperty("user_id");
  });

  it("E2 — response body has no 'journal_entry_id' field", async () => {
    pool.connect.mockResolvedValue(makeClient());
    const body = await (await doShare()).json();
    expect(body).not.toHaveProperty("journal_entry_id");
  });

  it("E3 — response contains only status, review_id, trust_weight", async () => {
    pool.connect.mockResolvedValue(makeClient());
    const body = await (await doShare()).json();
    expect(Object.keys(body).sort()).toEqual(["review_id", "status", "trust_weight"].sort());
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// F. Trust computation
// ═════════════════════════════════════════════════════════════════════════════

describe("F — trust computation via existing computeReportWeight", () => {
  it("F1 — computeReportWeight is called once per share (not duplicated)", async () => {
    pool.connect.mockResolvedValue(makeClient());
    await doShare();
    expect(mockComputeWeight).toHaveBeenCalledOnce();
  });

  it("F2 — grow_batch_id=null → batchVerified=false, no crash, trust computed", async () => {
    pool.connect.mockResolvedValue(makeClient({ entry: { ...JOURNAL_ENTRY, grow_batch_id: null } }));
    const res = await doShare();
    expect(res.status).toBe(200);
    expect(mockComputeWeight).toHaveBeenCalledWith(
      expect.objectContaining({ batchVerified: false }),
    );
  });

  it("F3 — license_verified=true → isVerifiedPatient=true in trust signals", async () => {
    pool.connect.mockResolvedValue(makeClient({ userRow: USER_ROW_VERIFIED }));
    await doShare();
    expect(mockComputeWeight).toHaveBeenCalledWith(
      expect.objectContaining({ isVerifiedPatient: true }),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// G. Idempotency — double share
// ═════════════════════════════════════════════════════════════════════════════

describe("G — idempotency: second share returns existing review_id without new INSERT", () => {
  it("G1 — returns 200 with existing review_id on second call", async () => {
    pool.connect.mockResolvedValue(makeClient({ existingReview: { id: "rev-existing" } }));
    const res  = await doShare();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.review_id).toBe("rev-existing");
  });

  it("G2 — no INSERT when already shared", async () => {
    const client = makeClient({ existingReview: { id: "rev-existing" } });
    pool.connect.mockResolvedValue(client);
    await doShare();

    const insertCalls = client.query.mock.calls.filter(
      ([sql]) => typeof sql === "string" && /INSERT INTO user_reviews/.test(sql),
    );
    expect(insertCalls).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// H. License gate
// ═════════════════════════════════════════════════════════════════════════════

describe("H — license gate: verified+expired → 403, no INSERT", () => {
  it("H1 — blocked license returns 403", async () => {
    mockLicenseGate.mockReturnValue({ blocked: true, message: "הרישיון פג תוקף." });
    const client = makeClient({ userRow: { license_verified: true, license_expiry: "2025-01-01" } });
    pool.connect.mockResolvedValue(client);

    const res = await doShare();
    expect(res.status).toBe(403);
  });

  it("H2 — no INSERT when license blocked", async () => {
    mockLicenseGate.mockReturnValue({ blocked: true, message: "הרישיון פג תוקף." });
    const client = makeClient({ userRow: { license_verified: true, license_expiry: "2025-01-01" } });
    pool.connect.mockResolvedValue(client);
    await doShare();

    const insertCalls = client.query.mock.calls.filter(
      ([sql]) => typeof sql === "string" && /INSERT INTO user_reviews/.test(sql),
    );
    expect(insertCalls).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// I. Schema-aware payload validation (INSERT values within DB CHECK bounds)
// ═════════════════════════════════════════════════════════════════════════════

describe("I — schema-aware: INSERT params satisfy DB CHECK constraints", () => {
  it("I1 — efficacy = rating (1–5 direct), passes CHECK BETWEEN 1 AND 5", async () => {
    pool.connect.mockResolvedValue(makeClient({ entry: { ...JOURNAL_ENTRY, rating: 5 } }));
    await doShare();

    expect(capturedInsertParams).not.toBeNull();
    expect(capturedInsertParams[2]).toBe(5); // efficacy = rating, not rating*2
    expect(() => assertInsertFitsSchema(capturedInsertParams)).not.toThrow();
  });

  it("I2 — REGRESSION: efficacy is never > 5 (was rating*2 at rating=5 → 10)", async () => {
    pool.connect.mockResolvedValue(makeClient({ entry: { ...JOURNAL_ENTRY, rating: 5 } }));
    await doShare();
    expect(capturedInsertParams[2]).toBeLessThanOrEqual(5);
  });

  it("I3 — REGRESSION: pain_relief is never 10 (was effects.includes('antiPain') ? 10 : null)", async () => {
    pool.connect.mockResolvedValue(makeClient({
      entry: { ...JOURNAL_ENTRY, effects: ["antiPain", "sleep"] },
    }));
    await doShare();
    expect(capturedInsertParams[4]).not.toBe(10); // pain_relief
    expect(capturedInsertParams[5]).not.toBe(10); // sleep_quality
  });

  it("I4 — full schema validation passes for all 5 ratings", async () => {
    for (const rating of [1, 2, 3, 4, 5]) {
      vi.clearAllMocks();
      mockComputeWeight.mockReturnValue(0.60);
      mockLicenseGate.mockReturnValue({ blocked: false, warning: null });

      pool.connect.mockResolvedValue(makeClient({ entry: { ...JOURNAL_ENTRY, rating } }));
      await doShare();

      expect(capturedInsertParams).not.toBeNull();
      expect(() => assertInsertFitsSchema(capturedInsertParams)).not.toThrow();
    }
  });
});
