import { describe, it, expect } from "vitest";
import { journalToReviewPayload } from "../journalToReview.js";

// ─────────────────────────────────────────────────────────────────────────────
//  Schema-aware validator — mirrors actual DB CHECK constraints from schema.sql.
//  This runs in tests so that any future mapping change that produces an
//  out-of-range value is caught here, not in production at INSERT time.
//
//  Pain point this closes: pain_relief:10 and efficacy:rating*2 both passed
//  17 unit tests but would have violated CHECK constraints at runtime.
// ─────────────────────────────────────────────────────────────────────────────

const SCHEMA_CONSTRAINTS = {
  // user_reviews columns with CHECK constraints (schema.sql lines 100-103)
  efficacy:    { check: "BETWEEN 1 AND 5", min: 1, max: 5, nullable: false },
  pain_relief: { check: "BETWEEN 1 AND 5", min: 1, max: 5, nullable: true  },
  sleep_quality: { check: "BETWEEN 1 AND 5", min: 1, max: 5, nullable: true  },
};

function assertFitsSchema(payload) {
  for (const [field, c] of Object.entries(SCHEMA_CONSTRAINTS)) {
    const val = payload[field];
    if (val === null || val === undefined) {
      if (!c.nullable) throw new Error(`Schema violation: ${field} is NOT NULL but got ${val}`);
      continue;
    }
    if (typeof val !== "number" || val < c.min || val > c.max) {
      throw new Error(
        `Schema violation: ${field}=${val} violates CHECK ${c.check} (expected null or ${c.min}-${c.max})`
      );
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const BASE = {
  strain_id:     "strain-abc",
  rating:        3,
  effects:       [],
  side_effects:  [],
  photo_url:     null,
  grow_batch_id: null,
};

// ── Schema constraint tests (DB-aware, no mock) ───────────────────────────────
describe("schema constraints — all numeric fields within DB CHECK bounds", () => {
  it("all 5 ratings produce efficacy within CHECK BETWEEN 1 AND 5", () => {
    for (const rating of [1, 2, 3, 4, 5]) {
      const payload = journalToReviewPayload({ ...BASE, rating });
      expect(() => assertFitsSchema(payload)).not.toThrow();
    }
  });

  it("pain_relief is always null — satisfies nullable CHECK column", () => {
    const payload = journalToReviewPayload({ ...BASE, effects: ["antiPain"] });
    expect(() => assertFitsSchema(payload)).not.toThrow();
    expect(payload.pain_relief).toBeNull();
  });

  it("sleep_quality is always null — satisfies nullable CHECK column", () => {
    const payload = journalToReviewPayload({ ...BASE, effects: ["sleep"] });
    expect(() => assertFitsSchema(payload)).not.toThrow();
    expect(payload.sleep_quality).toBeNull();
  });

  it("full payload with all effects still passes schema validation", () => {
    const payload = journalToReviewPayload({
      ...BASE,
      rating:       5,
      effects:      ["antiPain", "sleep", "mood", "bodyCalm", "clearHead", "antiAnxiety", "appetite"],
      side_effects: ["anxiety", "dizzy", "foggy"],
    });
    expect(() => assertFitsSchema(payload)).not.toThrow();
  });

  // Regression guard: these are the exact values that caused the original bug.
  it("REGRESSION: efficacy is never > 5 (would have been 10 with rating*2 at rating=5)", () => {
    const payload = journalToReviewPayload({ ...BASE, rating: 5 });
    expect(payload.efficacy).toBe(5);
    expect(payload.efficacy).toBeLessThanOrEqual(5);
  });

  it("REGRESSION: pain_relief is never 10 (would have violated CHECK BETWEEN 1 AND 5)", () => {
    const payload = journalToReviewPayload({ ...BASE, effects: ["antiPain"] });
    expect(payload.pain_relief).not.toBe(10);
    expect(payload.pain_relief).toBeNull();
  });
});

// ── Range table verification ──────────────────────────────────────────────────
//
//  Field          | DB CHECK          | Mapper output         | Status
//  ---------------|-------------------|-----------------------|-------
//  efficacy       | BETWEEN 1 AND 5   | rating (1–5)          | ✓
//  pain_relief    | BETWEEN 1 AND 5   | null (nullable)       | ✓
//  sleep_quality  | BETWEEN 1 AND 5   | null (nullable)       | ✓
//  anxiety_triggered | BOOLEAN NOT NULL | true/false          | ✓
//  side_effects   | TEXT[] NOT NULL   | TEXT[] (closed list)  | ✓
//  photo_url      | TEXT nullable     | null or string        | ✓
//  batch_id       | TEXT nullable     | null or string        | ✓
//

// ── Privacy: structural exclusions ───────────────────────────────────────────
describe("structural privacy — notes and side_effects_other are NOT in output", () => {
  it("output has no 'notes' key even when caller tries to pass it", () => {
    const result = journalToReviewPayload({ ...BASE, notes: "this must not appear" });
    expect(result).not.toHaveProperty("notes");
  });

  it("output has no 'side_effects_other' key even when caller tries to pass it", () => {
    const result = journalToReviewPayload({ ...BASE, side_effects_other: "other detail" });
    expect(result).not.toHaveProperty("side_effects_other");
  });
});

// ── efficacy = rating (1-5 direct, no multiplication) ─────────────────────────
describe("efficacy: rating passthrough (1–5)", () => {
  it("rating 1 → efficacy 1", () => {
    expect(journalToReviewPayload({ ...BASE, rating: 1 }).efficacy).toBe(1);
  });

  it("rating 5 → efficacy 5", () => {
    expect(journalToReviewPayload({ ...BASE, rating: 5 }).efficacy).toBe(5);
  });

  it("rating 3 → efficacy 3", () => {
    expect(journalToReviewPayload({ ...BASE, rating: 3 }).efficacy).toBe(3);
  });
});

// ── pain_relief and sleep_quality are always null ────────────────────────────
describe("pain_relief and sleep_quality — always null (no intensity data from journal)", () => {
  it("pain_relief is null even when antiPain is in effects", () => {
    expect(journalToReviewPayload({ ...BASE, effects: ["antiPain"] }).pain_relief).toBeNull();
  });

  it("pain_relief is null when antiPain is absent", () => {
    expect(journalToReviewPayload({ ...BASE, effects: ["mood"] }).pain_relief).toBeNull();
  });

  it("sleep_quality is null even when sleep is in effects", () => {
    expect(journalToReviewPayload({ ...BASE, effects: ["sleep"] }).sleep_quality).toBeNull();
  });

  it("sleep_quality is null when sleep is absent", () => {
    expect(journalToReviewPayload({ ...BASE, effects: ["bodyCalm"] }).sleep_quality).toBeNull();
  });
});

// ── Side-effect → anxiety_triggered ──────────────────────────────────────────
describe("anxiety_triggered", () => {
  it("true when 'anxiety' is in side_effects", () => {
    expect(journalToReviewPayload({ ...BASE, side_effects: ["anxiety", "dizzy"] }).anxiety_triggered).toBe(true);
  });

  it("false when 'anxiety' is absent from side_effects", () => {
    expect(journalToReviewPayload({ ...BASE, side_effects: ["dizzy", "foggy"] }).anxiety_triggered).toBe(false);
  });

  it("false when side_effects is empty", () => {
    expect(journalToReviewPayload({ ...BASE, side_effects: [] }).anxiety_triggered).toBe(false);
  });
});

// ── batch_id / photo_url passthrough ─────────────────────────────────────────
describe("grow_batch_id and photo_url", () => {
  it("grow_batch_id=null → batch_id=null", () => {
    expect(journalToReviewPayload({ ...BASE, grow_batch_id: null }).batch_id).toBeNull();
  });

  it("grow_batch_id value → batch_id value", () => {
    expect(journalToReviewPayload({ ...BASE, grow_batch_id: "BATCH-007" }).batch_id).toBe("BATCH-007");
  });

  it("photo_url=null → null", () => {
    expect(journalToReviewPayload({ ...BASE, photo_url: null }).photo_url).toBeNull();
  });

  it("photo_url value → passed through", () => {
    expect(journalToReviewPayload({ ...BASE, photo_url: "https://cdn.x/img.jpg" }).photo_url).toBe("https://cdn.x/img.jpg");
  });
});

// ── Defaults — no crash on missing optional fields ────────────────────────────
describe("defaults — no crash when optional fields omitted", () => {
  it("missing effects and side_effects default to empty arrays without crash", () => {
    const result = journalToReviewPayload({ strain_id: "s1", rating: 2 });
    expect(result.anxiety_triggered).toBe(false);
    expect(result.pain_relief).toBeNull();
    expect(result.sleep_quality).toBeNull();
    expect(result.side_effects).toEqual([]);
  });
});
