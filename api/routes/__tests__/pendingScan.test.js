/**
 * pendingScan.test.js — Layer 4.4: an unknown scanned strain creates a pending_product
 * row (needs review), never the live catalog (product_sku), carrying detected format/grower.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

vi.mock("../../db.js", () => ({ pool: { query: vi.fn() } }));

import http     from "http";
import express  from "express";
import { pool } from "../../db.js";
import catalogRouter from "../../routes/catalog.js";

let server, baseUrl;
beforeAll(() => new Promise((resolve) => {
  const app = express();
  app.use(express.json());
  app.use("/api", catalogRouter);
  server = http.createServer(app);
  server.listen(0, "127.0.0.1", () => { baseUrl = `http://127.0.0.1:${server.address().port}`; resolve(); });
}));
afterAll(() => new Promise((resolve) => server.close(resolve)));
beforeEach(() => vi.clearAllMocks());

const post = (body) => fetch(`${baseUrl}/api/pending-scan`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

describe("POST /api/pending-scan — unknown strain enqueues to pending_product", () => {
  it("inserts into pending_product (not product_sku) with format/grower in raw_context", async () => {
    pool.query.mockResolvedValue({ rowCount: 1 });

    const res = await post({ names: [{
      name: "זן בדיקה ולנטיין", cat: "T22/C4", format: "oil", grower: "מגדל בדיקה",
      raw: "שמן זן בדיקה ולנטיין T22/C4 300₪",
    }] });
    expect(res.status).toBe(200);
    expect((await res.json()).added).toBe(1);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO pending_product/);
    expect(sql).not.toMatch(/product_sku/);                    // never the live catalog
    expect(sql).not.toMatch(/'approved'/);                    // never auto-approved
    expect(sql).toMatch(/'pending'/);                         // queued for review
    expect(sql).toMatch(/ON CONFLICT \(canonical_key\)/);     // dedup on the real unique index
    expect(sql).toMatch(/'user-scan'/);                       // valid sku_source

    // params: [commercial_name, normalized_name, product_format, canonical_key, raw_context]
    expect(params[2]).toBe("oil");                           // product_format
    expect(params[3]).toContain("|oil|");                    // canonical_key = normalize(name)|format|grower
    const context = JSON.parse(params[4]);                   // raw_context JSON
    expect(context.format).toBe("oil");
    expect(context.grower).toBe("מגדל בדיקה");
    expect(context.raw).toContain("ולנטיין");
  });

  it("skips too-short names", async () => {
    pool.query.mockResolvedValue({ rowCount: 1 });
    const res = await post({ names: [{ name: "ab" }] });
    expect((await res.json()).added).toBe(0);
    expect(pool.query).not.toHaveBeenCalled();
  });
});
