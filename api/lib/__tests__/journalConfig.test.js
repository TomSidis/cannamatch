/**
 * journalConfig.test.js — Validates the closed-list config for Phase C2.
 *
 * Tests:
 *   A. EFFECTS shape and alignment with EFFECT_AXIS_KEYS
 *   B. SIDE_EFFECTS shape and sentinel rules
 *   C. ID uniqueness and cross-list collision policy
 *   D. filterToClosedList behaviour
 *   E. Structural invariants (no missing fields, correct types)
 */

import { describe, it, expect } from "vitest";
import {
  EFFECTS,
  SIDE_EFFECTS,
  EFFECT_IDS,
  SIDE_EFFECT_IDS,
  filterToClosedList,
} from "../journalConfig.js";

// Canonical terpeneScience.ts EFFECT_AXIS_KEYS — the DNA engine's vocabulary
const EFFECT_AXIS_KEYS = ["bodyCalm", "clearHead", "sleep", "antiPain", "mood", "antiAnxiety", "appetite"];

// ── A. EFFECTS alignment with EFFECT_AXIS_KEYS ───────────────────────────────
describe("A — EFFECTS aligns with terpeneScience.ts EFFECT_AXIS_KEYS", () => {
  it("every EFFECT id is a valid EFFECT_AXIS_KEY", () => {
    const axisSet = new Set(EFFECT_AXIS_KEYS);
    for (const e of EFFECTS) {
      expect(axisSet.has(e.id), `"${e.id}" is not in EFFECT_AXIS_KEYS`).toBe(true);
    }
  });

  it("every EFFECT_AXIS_KEY has a matching EFFECT entry", () => {
    for (const key of EFFECT_AXIS_KEYS) {
      expect(EFFECT_IDS.has(key), `EFFECT_AXIS_KEY "${key}" missing from EFFECTS`).toBe(true);
    }
  });

  it("EFFECTS count equals EFFECT_AXIS_KEYS count (no extras, no missing)", () => {
    expect(EFFECTS.length).toBe(EFFECT_AXIS_KEYS.length);
  });

  it("no 'other' sentinel in EFFECTS (free-text only allowed in SIDE_EFFECTS)", () => {
    expect(EFFECTS.some((e) => e.id === "other" || e.isFreeText)).toBe(false);
  });
});

// ── B. SIDE_EFFECTS shape and sentinel rules ─────────────────────────────────
describe("B — SIDE_EFFECTS shape and sentinel rules", () => {
  it("contains exactly one 'other' sentinel", () => {
    const others = SIDE_EFFECTS.filter((e) => e.isFreeText);
    expect(others).toHaveLength(1);
    expect(others[0].id).toBe("other");
  });

  it("'other' sentinel has isFreeText: true and is the last entry", () => {
    const last = SIDE_EFFECTS.at(-1);
    expect(last.id).toBe("other");
    expect(last.isFreeText).toBe(true);
  });

  it("includes all 9 user-defined adverse effects", () => {
    const required = ["dry_mouth", "anxiety", "dizzy", "oversleep", "foggy",
                      "munchies", "heart_rate", "headache", "nausea"];
    for (const id of required) {
      expect(SIDE_EFFECT_IDS.has(id), `"${id}" missing from SIDE_EFFECT_IDS`).toBe(true);
    }
  });

  it("'anxiety' side_effect maps to anxietyTriggered signal (documented)", () => {
    const entry = SIDE_EFFECTS.find((e) => e.id === "anxiety");
    expect(entry).toBeDefined();
    // This id is the signal the DNA mapper (C2.4) will use for anxietyTriggered
    expect(entry.id).toBe("anxiety");
  });

  it("SIDE_EFFECT_IDS excludes 'other' (free-text sentinel not a closed-list value)", () => {
    expect(SIDE_EFFECT_IDS.has("other")).toBe(false);
  });
});

// ── C. ID uniqueness and cross-list collision policy ─────────────────────────
describe("C — ID uniqueness and cross-list collision policy", () => {
  it("all EFFECTS ids are unique within the list", () => {
    const ids = EFFECTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all SIDE_EFFECTS ids are unique within the list", () => {
    const ids = SIDE_EFFECTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("'appetite' (wanted effect) and 'munchies' (unwanted) use different IDs to avoid collision", () => {
    expect(EFFECT_IDS.has("appetite")).toBe(true);
    expect(SIDE_EFFECT_IDS.has("munchies")).toBe(true);
    // They must not share an ID — same ID in both lists would make the DNA mapper ambiguous
    expect(EFFECT_IDS.has("munchies")).toBe(false);
    expect(SIDE_EFFECT_IDS.has("appetite")).toBe(false);
  });
});

// ── D. filterToClosedList ────────────────────────────────────────────────────
describe("D — filterToClosedList", () => {
  it("passes valid effect IDs through", () => {
    expect(filterToClosedList(["sleep", "mood"], EFFECT_IDS)).toEqual(["sleep", "mood"]);
  });

  it("strips unknown IDs without throwing", () => {
    expect(filterToClosedList(["sleep", "unknown_effect", "mood"], EFFECT_IDS))
      .toEqual(["sleep", "mood"]);
  });

  it("returns empty array for empty input", () => {
    expect(filterToClosedList([], EFFECT_IDS)).toEqual([]);
  });

  it("returns empty array for null/undefined input (client sent bad data)", () => {
    expect(filterToClosedList(null, EFFECT_IDS)).toEqual([]);
    expect(filterToClosedList(undefined, EFFECT_IDS)).toEqual([]);
  });

  it("'other' is stripped from side_effects array by SIDE_EFFECT_IDS (stored separately)", () => {
    const incoming = ["anxiety", "foggy", "other"];
    expect(filterToClosedList(incoming, SIDE_EFFECT_IDS)).toEqual(["anxiety", "foggy"]);
  });

  it("all 9 non-sentinel side_effect IDs pass the filter", () => {
    const allNonSentinel = SIDE_EFFECTS.filter((e) => !e.isFreeText).map((e) => e.id);
    expect(filterToClosedList(allNonSentinel, SIDE_EFFECT_IDS)).toEqual(allNonSentinel);
  });
});

// ── E. Structural invariants (every entry has required fields) ────────────────
describe("E — all config entries have required fields", () => {
  it("every EFFECT entry has id, label, emoji", () => {
    for (const e of EFFECTS) {
      expect(typeof e.id).toBe("string");
      expect(typeof e.label).toBe("string");
      expect(typeof e.emoji).toBe("string");
    }
  });

  it("every SIDE_EFFECT entry has id, label, emoji", () => {
    for (const e of SIDE_EFFECTS) {
      expect(typeof e.id).toBe("string");
      expect(typeof e.label).toBe("string");
      expect(typeof e.emoji).toBe("string");
    }
  });

  it("every label is a non-empty Hebrew string", () => {
    for (const e of [...EFFECTS, ...SIDE_EFFECTS]) {
      expect(e.label.length).toBeGreaterThan(0);
      expect(e.label).toMatch(/[א-ת]/); // contains Hebrew
    }
  });
});
