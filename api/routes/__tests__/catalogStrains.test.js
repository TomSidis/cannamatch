/**
 * catalogStrains.test.js — GET /api/catalog/strains serves the LIVE catalog
 * (product_sku, status='active') for the onboarding picker — never pending_product.
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

const get = (qs) => fetch(`${baseUrl}/api/catalog/strains${qs}`);

describe("GET /api/catalog/strains", () => {
  it("queries product_sku active, never pending_product, and returns items", async () => {
    pool.query.mockResolvedValue({ rows: [
      { id: "sku1", name: "אור", category: "T15/C3", grower: "טיקון", genetics: "OG" },
    ] });

    const res = await get("?q=אור");
    expect(res.status).toBe(200);
    expect((await res.json()).items[0].name).toBe("אור");

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/FROM product_sku/);
    expect(sql).toMatch(/status = 'active'/);
    expect(sql).not.toMatch(/pending_product/);
    expect(sql).toMatch(/ILIKE/);               // search applied
    expect(sql).toMatch(/commercial_name ILIKE[\s\S]*OR[\s\S]*grower ILIKE/); // name OR grower
    expect(params).toContain("%אור%");
  });

  it("filters by licensed categories when cats provided", async () => {
    pool.query.mockResolvedValue({ rows: [] });
    await get("?cats=T15/C3,T22/C4");
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/category = ANY/);
    expect(params).toContainEqual(["T15/C3", "T22/C4"]);
  });

  it("empty query returns the default active list (no ILIKE)", async () => {
    pool.query.mockResolvedValue({ rows: [{ id: "s", name: "אור", category: "T15/C3", grower: " x" }] });
    const res = await get("");
    expect(res.status).toBe(200);
    expect((await res.json()).items.length).toBe(1);
    expect(pool.query.mock.calls[0][0]).not.toMatch(/ILIKE/);
  });

  it("returns [] gracefully when the table is missing (pre-migration)", async () => {
    pool.query.mockRejectedValue(Object.assign(new Error("no table"), { code: "42P01" }));
    const res = await get("?q=x");
    expect(res.status).toBe(200);
    expect((await res.json()).items).toEqual([]);
  });
});
