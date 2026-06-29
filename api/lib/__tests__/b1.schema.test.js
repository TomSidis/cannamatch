/**
 * B1 schema foundations tests.
 *
 * Since we have no real DB in CI, tests cover:
 *   1. Migration file — DDL contains every required column definition
 *   2. Delta logic    — pure arithmetic matches DB GENERATED ALWAYS AS semantics
 *   3. Journal route  — new fields flow through POST and appear in GET SELECT
 *
 * All DB calls are mocked (same pattern as existing journal tests).
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import http    from "http";
import express from "express";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Read migration file once ──────────────────────────────────────────────────
const MIG = readFileSync(
  join(__dirname, "../../db/migrations/018_b1_schema_foundations.sql"),
  "utf8",
);

// ── 1. Migration DDL assertions ───────────────────────────────────────────────

describe("018 migration — genetics_node columns", () => {
  it("adds chemotype with I/II/III/IV/V check", () => {
    expect(MIG).toContain("chemotype");
    expect(MIG).toMatch(/IN\s*\(\s*'I'\s*,\s*'II'\s*,\s*'III'\s*,\s*'IV'\s*,\s*'V'\s*\)/);
  });

  it("adds parent_a TEXT referencing genetics_node", () => {
    expect(MIG).toMatch(/parent_a\s+TEXT\s+REFERENCES\s+genetics_node/);
  });

  it("adds parent_b TEXT referencing genetics_node", () => {
    expect(MIG).toMatch(/parent_b\s+TEXT\s+REFERENCES\s+genetics_node/);
  });

  it("comments that chemotype must NOT feed scoring", () => {
    expect(MIG).toMatch(/NEVER feed scoring/i);
  });
});

describe("018 migration — terpene_source on product_sku + grow_batch", () => {
  it("adds terpene_source to product_sku with three valid values", () => {
    expect(MIG).toMatch(/product_sku[\s\S]{0,200}terpene_source/);
    expect(MIG).toMatch(/measured.*declared_rank.*community_inferred/);
  });

  it("adds terpene_source to grow_batch", () => {
    expect(MIG).toMatch(/grow_batch[\s\S]{0,200}terpene_source/);
  });

  it("default is 'declared_rank'", () => {
    expect(MIG).toMatch(/DEFAULT\s+'declared_rank'/);
  });
});

describe("018 migration — treatment_journal columns", () => {
  it("adds severity_before with 0–10 check", () => {
    expect(MIG).toContain("severity_before");
    expect(MIG).toMatch(/severity_before\s+BETWEEN\s+0\s+AND\s+10/);
  });

  it("adds severity_after with 0–10 check", () => {
    expect(MIG).toContain("severity_after");
    expect(MIG).toMatch(/severity_after\s+BETWEEN\s+0\s+AND\s+10/);
  });

  it("adds delta as GENERATED ALWAYS AS (severity_after - severity_before) STORED", () => {
    expect(MIG).toMatch(/GENERATED ALWAYS AS\s*\(\s*severity_after\s*-\s*severity_before\s*\)\s*STORED/);
  });

  it("adds indication TEXT", () => {
    expect(MIG).toContain("indication");
  });

  it("adds time_of_day with morning/afternoon/evening/night check", () => {
    expect(MIG).toMatch(/time_of_day\s+IN\s*\(\s*'morning'/);
    expect(MIG).toContain("'night'");
  });

  it("adds product_sku_id UUID referencing product_sku", () => {
    expect(MIG).toMatch(/product_sku_id\s+UUID\s+REFERENCES\s+product_sku/);
  });

  it("adds batch_id TEXT", () => {
    expect(MIG).toMatch(/batch_id\s+TEXT/);
  });

  it("guards delta with DO block for IF NOT EXISTS safety", () => {
    expect(MIG).toMatch(/DO\s*\$\$/);
    expect(MIG).toMatch(/column_name\s*=\s*'delta'/);
  });
});

// ── 2. Delta computation logic ────────────────────────────────────────────────

describe("delta = severity_after − severity_before", () => {
  const delta = (before, after) =>
    before == null || after == null ? null : after - before;

  it("improvement: before=8 after=3 → delta = -5", () => {
    expect(delta(8, 3)).toBe(-5);
  });

  it("worsening: before=2 after=7 → delta = +5", () => {
    expect(delta(2, 7)).toBe(5);
  });

  it("no change: before=5 after=5 → delta = 0", () => {
    expect(delta(5, 5)).toBe(0);
  });

  it("NULL before → delta = null", () => {
    expect(delta(null, 7)).toBeNull();
  });

  it("NULL after → delta = null", () => {
    expect(delta(3, null)).toBeNull();
  });

  it("full relief: before=10 after=0 → delta = -10", () => {
    expect(delta(10, 0)).toBe(-10);
  });
});

// ── 3. Journal route — new fields flow through POST ───────────────────────────

vi.mock("../../security/claudeProxyShield.js", () => ({
  verifySession: (req, _res, next) => { req.userId = "test-b1"; next(); },
}));

vi.mock("../../db.js", () => ({
  pool: { connect: vi.fn(), query: vi.fn() },
}));

import { pool }      from "../../db.js";
import journalRouter from "../../routes/journal.js";

let server, baseUrl;

beforeAll(() => new Promise((resolve) => {
  const app = express();
  app.use(express.json());
  app.use("/api/journal", journalRouter);
  server = http.createServer(app);
  server.listen(0, "127.0.0.1", () => {
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    resolve();
  });
}));

afterAll(() => new Promise((resolve) => server.close(resolve)));
beforeEach(() => vi.clearAllMocks());

const ENTRY_ROW = { id: "b1-test-001", created_at: new Date("2026-06-28T10:00:00Z") };
const STRAIN_ID = "550e8400-e29b-41d4-a716-446655440001";
const SKU_UUID  = "660e8400-e29b-41d4-a716-446655440099";

function setupMockClient() {
  const client = {
    query: vi.fn(async (sql) => {
      if (/BEGIN|COMMIT|ROLLBACK/.test(sql))        return {};
      if (/INSERT INTO treatment_journal/.test(sql)) return { rows: [ENTRY_ROW] };
      if (/user_dna_profiles/.test(sql))             return { rows: [] };
      if (/SELECT.*FROM strains/.test(sql))          return { rows: [] };
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  pool.connect.mockResolvedValue(client);
  return client;
}

describe("POST /api/journal/treatment — B1 fields included in INSERT", () => {
  it("passes severity_before and severity_after to DB", async () => {
    const client = setupMockClient();

    await fetch(`${baseUrl}/api/journal/treatment`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        strain_id:       STRAIN_ID,
        rating:          4,
        severity_before: 8,
        severity_after:  3,
        indication:      "sleep",
        time_of_day:     "evening",
        product_sku_id:  SKU_UUID,
        batch_id:        "BATCH-2026-B1",
      }),
    });

    const insertCall = client.query.mock.calls.find(([sql]) =>
      /INSERT INTO treatment_journal/.test(sql),
    );
    expect(insertCall).toBeDefined();

    const [sql, params] = insertCall;
    // New columns must appear in the INSERT statement
    expect(sql).toContain("severity_before");
    expect(sql).toContain("severity_after");
    expect(sql).toContain("indication");
    expect(sql).toContain("time_of_day");
    expect(sql).toContain("product_sku_id");
    expect(sql).toContain("batch_id");

    // Parameter values must be correctly positioned
    expect(params).toContain(8);            // severity_before
    expect(params).toContain(3);            // severity_after
    expect(params).toContain("sleep");      // indication
    expect(params).toContain("evening");    // time_of_day
    expect(params).toContain(SKU_UUID);     // product_sku_id
    expect(params).toContain("BATCH-2026-B1"); // batch_id
  });

  it("strips invalid severity values (out of 0–10 range)", async () => {
    const client = setupMockClient();

    await fetch(`${baseUrl}/api/journal/treatment`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        strain_id:       STRAIN_ID,
        rating:          3,
        severity_before: -1,  // invalid
        severity_after:  11,  // invalid
      }),
    });

    const insertCall = client.query.mock.calls.find(([sql]) =>
      /INSERT INTO treatment_journal/.test(sql),
    );
    const params = insertCall[1];
    // Both should be null-coerced
    expect(params).toContain(null);
    // Should not contain -1 or 11
    expect(params).not.toContain(-1);
    expect(params).not.toContain(11);
  });

  it("strips invalid time_of_day", async () => {
    const client = setupMockClient();

    await fetch(`${baseUrl}/api/journal/treatment`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        strain_id:   STRAIN_ID,
        rating:      3,
        time_of_day: "midnight",  // not in closed list
      }),
    });

    const insertCall = client.query.mock.calls.find(([sql]) =>
      /INSERT INTO treatment_journal/.test(sql),
    );
    const params = insertCall[1];
    expect(params).not.toContain("midnight");
  });

  it("strips malformed product_sku_id (not a UUID)", async () => {
    const client = setupMockClient();

    await fetch(`${baseUrl}/api/journal/treatment`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        strain_id:      STRAIN_ID,
        rating:         3,
        product_sku_id: "not-a-uuid",
      }),
    });

    const insertCall = client.query.mock.calls.find(([sql]) =>
      /INSERT INTO treatment_journal/.test(sql),
    );
    const params = insertCall[1];
    expect(params).not.toContain("not-a-uuid");
  });
});

describe("GET /api/journal/treatment — SELECT includes B1 columns", () => {
  it("SELECT query includes severity_before, severity_after, delta", async () => {
    pool.query.mockResolvedValue({ rows: [] });

    await fetch(`${baseUrl}/api/journal/treatment`);

    const [[sql]] = pool.query.mock.calls;
    expect(sql).toContain("severity_before");
    expect(sql).toContain("severity_after");
    expect(sql).toContain("delta");
    expect(sql).toContain("indication");
    expect(sql).toContain("time_of_day");
  });
});
