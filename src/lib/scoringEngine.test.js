// Vitest test suite for scoringEngine.js
// Run: npx vitest run src/lib/scoringEngine.test.js

import { describe, test, expect } from "vitest";
import { buildProfile, rawScore, scoreAll, matchTier } from "./scoringEngine.js";

// ── Minimal mock config ───────────────────────────────────────
const TERPENES = {
  myrcene: {}, linalool: {}, caryophyllene: {},
  limonene: {}, terpinolene: {}, pinene: {},
};
const REASONS = [
  { id: "sleep",   label: "שינה",   terps: ["myrcene",  "linalool"] },
  { id: "anxiety", label: "חרדה",   terps: ["linalool", "limonene"] },
  { id: "focus",   label: "ריכוז",  terps: ["terpinolene", "pinene"] },
];
const STRAINS = [
  // s1 — perfect indica match for sleep/anxiety
  { id: "s1", cat: "T22/C4", effects: ["sleep", "anxiety"], type: "flower",
    terps: { myrcene: 0.9, linalool: 0.8, caryophyllene: 0.4 } },
  // s2 — sativa, terpinolene-heavy (potential trigger strain)
  { id: "s2", cat: "T22/C4", effects: ["focus"], type: "flower",
    terps: { terpinolene: 0.85, limonene: 0.6, myrcene: 0.1 } },
  // s3 — missing terpene data entirely
  { id: "s3", cat: "T22/C4", effects: ["sleep"], type: "flower",
    terps: {} },
];
const CFG = { strains: STRAINS, terpenes: TERPENES, reasons: REASONS };
const BASE_ANS = {
  cats: ["T22/C4"], reasons: ["sleep"], flavors: [],
  helped: [], notHelped: [], current: [],
};

// ─────────────────────────────────────────────────────────────

describe("scoringEngine", () => {
  // 1. Perfect genetic match — strain with matching terps and indication
  //    should rank first and score at or near the ceiling (≥ 80).
  test("perfect match — highest-terp strain for active reason ranks first", () => {
    const scored = scoreAll(BASE_ANS, {}, CFG);
    expect(scored.length).toBeGreaterThan(0);
    expect(scored[0].id).toBe("s1");          // s1 has myrcene+linalool matching "sleep"
    expect(scored[0].match).toBeGreaterThanOrEqual(80);
    expect(scored[0].match).toBeLessThanOrEqual(98); // engine ceiling is 98
  });

  // 2. Trigger sensitivity — notHelped strain receives the -5 raw-score
  //    penalty, making its raw score meaningfully lower than a neutral strain.
  test("trigger sensitivity — notHelped penalty lowers raw score by ≥ 5", () => {
    const ans = { ...BASE_ANS, notHelped: ["s2"] };
    const profile = buildProfile(ans, {}, CFG);

    const penalised = rawScore(STRAINS[1], profile, ans);   // s2 is in notHelped
    const neutral   = rawScore(STRAINS[0], profile, ans);   // s1 is not

    // The penalty in rawScore is an unconditional -5 for notHelped strains
    expect(penalised).toBeLessThan(neutral - 4.5);
  });

  // 3. Missing terpene profile — empty terps object must not crash, and the
  //    strain should still appear in results clamped to the 40-point floor.
  test("missing terpene profile — no crash, result clamped to ≥ 40", () => {
    expect(() => scoreAll(BASE_ANS, {}, CFG)).not.toThrow();
    const scored = scoreAll(BASE_ANS, {}, CFG);
    const s3 = scored.find((s) => s.id === "s3");
    expect(s3).toBeDefined();
    expect(s3.match).toBeGreaterThanOrEqual(40);
    expect(s3._raw).toBeCloseTo(0, 5); // 0 contribution from empty terps dict
  });

  // 4. buildProfile calibration — verify the weight accumulation:
  //    flavors contribute 1.0, primary reason terp 1.2, secondary 0.8.
  //    A terpene in both flavor AND reason must accumulate both contributions.
  test("buildProfile — weights accumulate correctly for flavors + reasons", () => {
    const ans = {
      ...BASE_ANS,
      flavors: ["linalool"],      // +1.0 to linalool
      reasons: ["anxiety"],       // primary: linalool +1.2, secondary: limonene +0.8
    };
    const profile = buildProfile(ans, {}, CFG);

    expect(profile.linalool).toBeCloseTo(2.2, 5);   // 1.0 (flavor) + 1.2 (primary terp)
    expect(profile.limonene).toBeCloseTo(0.8, 5);   // 0.8 (secondary terp)
    expect(profile.myrcene).toBeUndefined();         // not touched by anxiety reason
    expect(profile.terpinolene).toBeUndefined();     // not touched at all
  });

  // Bonus: matchTier boundaries
  test("matchTier returns correct tier for boundary scores", () => {
    expect(matchTier(85).label).toBe("התאמה מצוינת");
    expect(matchTier(72).label).toBe("התאמה טובה");
    expect(matchTier(60).label).toBe("התאמה חלקית");
    expect(matchTier(59).label).toBe("התאמה נמוכה");
    expect(matchTier(85).show).toBe(true);
    expect(matchTier(59).show).toBe(false);
  });
});
