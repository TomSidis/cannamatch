/**
 * basketPlan.test.js — Layer 6.5: POST /api/basket/plan returns BOTH routes (יקר / זול),
 * same fit-first selection, price never adjacent to the match %.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

vi.mock("../../security/claudeProxyShield.js", () => ({
  verifySession: (req, _res, next) => { req.userId = "u-basket"; next(); },
}));
vi.mock("../../db.js", () => ({ pool: { query: vi.fn() } }));

import http     from "http";
import express  from "express";
import { pool } from "../../db.js";
import basketRouter from "../../routes/basket.js";

let server, baseUrl;
beforeAll(() => new Promise((resolve) => {
  const app = express();
  app.use(express.json());
  app.use("/api", basketRouter);
  server = http.createServer(app);
  server.listen(0, "127.0.0.1", () => { baseUrl = `http://127.0.0.1:${server.address().port}`; resolve(); });
}));
afterAll(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => {
  vi.clearAllMocks();
  pool.query.mockImplementation((sql) => {
    if (/user_dna_profiles/.test(sql)) {
      return Promise.resolve({ rows: [{ profile: { categories: ["T22/C4"], indications: ["sleep"], gramsByCategory: { "T22/C4": 20 } } }] });
    }
    if (/FROM strains/.test(sql)) {
      return Promise.resolve({ rows: [
        { id: "s-sleep", name: "אור", terpene_dist: { myrcene: 0.8, linalool: 0.4 }, category: "T22/C4", price: 300, in_stock: true, pharmacy_name: "פארמה" },
        { id: "s-pain",  name: "פיין", terpene_dist: { caryophyllene: 0.7 },          category: "T22/C4", price: 180, in_stock: true, pharmacy_name: "פארמה" },
      ] });
    }
    return Promise.resolve({ rows: [] });
  });
});

const plan = (body) => fetch(`${baseUrl}/api/basket/plan`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

describe("POST /api/basket/plan returns both routes", () => {
  it("responds with expensive + cheap, same fit-first selection", async () => {
    const res = await plan({ track: "balanced" });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(Array.isArray(body.expensive?.bags)).toBe(true);
    expect(Array.isArray(body.cheap?.bags)).toBe(true);
    expect(body.expensive.bags.length).toBeGreaterThan(0);
    // identical underlying strain selection — routes differ only by presentation
    expect(body.cheap.bags.map((b) => b.batchId)).toEqual(body.expensive.bags.map((b) => b.batchId));
  });

  it("bags carry matchPct but no price beside it (price nested in presentation)", async () => {
    const res = await plan({ track: "balanced" });
    const body = await res.json();
    for (const b of body.expensive.bags) {
      expect(typeof b.matchPct).toBe("number");
      expect("price" in b).toBe(false);
    }
  });
});
