/**
 * treatmentJournalFeedback.test.js — Phase C2.4: DNA profile feed mapping.
 *
 * CRITICAL tests (explicitly required):
 *   ★ notes NOT in feedback (never fed to DNA profile)
 *   ★ side_effects_other NOT in feedback (never fed to DNA profile)
 *   ★ side_effects DO reach feedback and affect the profile (not just effects)
 *   ★ grow_batch_id = NULL does not break the connection
 *
 * Additional tests:
 *   A. Output shape — exactly 5 keys, correct types
 *   B. rating scaling — 1-5 → 2-10 efficacy (before side-effect penalty)
 *   C. effects mapping — antiPain → painRelief, sleep → sleepQuality
 *   D. side_effects mapping — anxiety → anxietyTriggered, others → efficacy penalty
 *   E. Integration with updateUserDNAProfile — confirms feedback drives real profile changes
 */

import { describe, it, expect } from "vitest";
import { treatmentJournalToFeedback } from "../treatmentJournalFeedback.js";
import { updateUserDNAProfile }        from "../dnaProfile.js";

// ── ★ CRITICAL: notes must never reach the DNA profile ────────────────────────
describe("★ CRITICAL — notes are never fed to the DNA profile", () => {
  it("feedback object contains no 'notes' key even if accidentally passed", () => {
    const feedback = treatmentJournalToFeedback({
      rating:  4,
      effects: ["sleep"],
      side_effects: [],
      notes:   "הרגשתי טוב מאוד — פרטי לחלוטין",
    });
    expect(Object.keys(feedback)).not.toContain("notes");
  });

  it("notes text does not appear anywhere in the serialized feedback", () => {
    const privateText = "זה מידע פרטי שלא אמור לצאת";
    const feedback = treatmentJournalToFeedback({
      rating:  3,
      effects: [],
      side_effects: [],
      notes:   privateText,
    });
    expect(JSON.stringify(feedback)).not.toContain(privateText);
  });
});

// ── ★ CRITICAL: side_effects_other must never reach the DNA profile ──────────
describe("★ CRITICAL — side_effects_other is never fed to the DNA profile", () => {
  it("feedback object contains no 'side_effects_other' key even if accidentally passed", () => {
    const feedback = treatmentJournalToFeedback({
      rating:             3,
      effects:            [],
      side_effects:       ["dry_mouth"],
      side_effects_other: "כאב גרון קל — פרטי",
    });
    expect(Object.keys(feedback)).not.toContain("side_effects_other");
  });

  it("side_effects_other text does not appear anywhere in the serialized feedback", () => {
    const freeText = "תופעה אישית שאינה ברשימה";
    const feedback = treatmentJournalToFeedback({
      rating:             4,
      effects:            ["mood"],
      side_effects:       [],
      side_effects_other: freeText,
    });
    expect(JSON.stringify(feedback)).not.toContain(freeText);
  });
});

// ── ★ CRITICAL: side_effects DO reach the profile (not only positive effects) ─
describe("★ CRITICAL — side_effects are funneled to the DNA profile", () => {
  it("side_effects lower efficacy compared to the same entry without side_effects", () => {
    const withoutSideEffects = treatmentJournalToFeedback({ rating: 4, effects: [], side_effects: [] });
    const withSideEffects    = treatmentJournalToFeedback({ rating: 4, effects: [], side_effects: ["foggy", "headache"] });
    expect(withSideEffects.efficacy).toBeLessThan(withoutSideEffects.efficacy);
  });

  it("'anxiety' side_effect sets anxietyTriggered = true (hard negative signal)", () => {
    const feedback = treatmentJournalToFeedback({ rating: 4, effects: [], side_effects: ["anxiety"] });
    expect(feedback.anxietyTriggered).toBe(true);
  });

  it("no side_effects → anxietyTriggered = false", () => {
    const feedback = treatmentJournalToFeedback({ rating: 4, effects: ["mood"], side_effects: [] });
    expect(feedback.anxietyTriggered).toBe(false);
  });

  it("positive effects alone do not set anxietyTriggered", () => {
    const feedback = treatmentJournalToFeedback({
      rating: 5,
      effects: ["sleep", "antiPain", "mood"],
      side_effects: [],
    });
    expect(feedback.anxietyTriggered).toBe(false);
  });
});

// ── ★ CRITICAL: grow_batch_id = NULL does not break the connection ───────────
describe("★ CRITICAL — grow_batch_id = NULL does not affect or break the feedback", () => {
  it("does not throw when grow_batch_id is null (not used in feedback mapping)", () => {
    expect(() =>
      treatmentJournalToFeedback({
        rating:        3,
        effects:       ["sleep"],
        side_effects:  [],
        grow_batch_id: null,
      }),
    ).not.toThrow();
  });

  it("grow_batch_id null or present produces identical feedback (field is irrelevant)", () => {
    const withNull    = treatmentJournalToFeedback({ rating: 3, effects: ["sleep"], side_effects: [], grow_batch_id: null });
    const withBatch   = treatmentJournalToFeedback({ rating: 3, effects: ["sleep"], side_effects: [], grow_batch_id: "BATCH-2026-XYZ" });
    expect(withNull).toEqual(withBatch);
  });
});

// ── A. Output shape ───────────────────────────────────────────────────────────
describe("A — output shape", () => {
  it("returns exactly 5 keys: efficacy, painRelief, sleepQuality, anxietyTriggered, indication", () => {
    const feedback = treatmentJournalToFeedback({ rating: 3, effects: [], side_effects: [] });
    expect(Object.keys(feedback).sort()).toEqual(
      ["anxietyTriggered", "efficacy", "indication", "painRelief", "sleepQuality"].sort(),
    );
  });

  it("indication is always null (C2 does not set indication from journal)", () => {
    const feedback = treatmentJournalToFeedback({ rating: 5, effects: ["sleep", "mood"], side_effects: [] });
    expect(feedback.indication).toBeNull();
  });

  it("efficacy is always a non-negative number", () => {
    for (const rating of [1, 2, 3, 4, 5]) {
      const feedback = treatmentJournalToFeedback({
        rating,
        effects: [],
        side_effects: ["foggy", "headache", "nausea", "dizzy", "dry_mouth"],
      });
      expect(feedback.efficacy).toBeGreaterThanOrEqual(0);
    }
  });
});

// ── B. Rating scaling ─────────────────────────────────────────────────────────
describe("B — rating scaling (1-5 → 2-10 before penalty)", () => {
  it("rating 1 → base efficacy 2", () => {
    const feedback = treatmentJournalToFeedback({ rating: 1, effects: [], side_effects: [] });
    expect(feedback.efficacy).toBe(2);
  });

  it("rating 5 → base efficacy 10", () => {
    const feedback = treatmentJournalToFeedback({ rating: 5, effects: [], side_effects: [] });
    expect(feedback.efficacy).toBe(10);
  });

  it("rating 3 → base efficacy 6 (neutral threshold)", () => {
    const feedback = treatmentJournalToFeedback({ rating: 3, effects: [], side_effects: [] });
    expect(feedback.efficacy).toBe(6);
  });
});

// ── C. Effects mapping ────────────────────────────────────────────────────────
describe("C — effects map to painRelief and sleepQuality", () => {
  it("'antiPain' in effects → painRelief = 5", () => {
    const feedback = treatmentJournalToFeedback({ rating: 3, effects: ["antiPain"], side_effects: [] });
    expect(feedback.painRelief).toBe(5);
  });

  it("'sleep' in effects → sleepQuality = 5", () => {
    const feedback = treatmentJournalToFeedback({ rating: 3, effects: ["sleep"], side_effects: [] });
    expect(feedback.sleepQuality).toBe(5);
  });

  it("neither in effects → painRelief = 0, sleepQuality = 0", () => {
    const feedback = treatmentJournalToFeedback({ rating: 3, effects: ["mood", "clearHead"], side_effects: [] });
    expect(feedback.painRelief).toBe(0);
    expect(feedback.sleepQuality).toBe(0);
  });

  it("other effect IDs (mood, bodyCalm, etc.) do not affect painRelief/sleepQuality directly", () => {
    const withOther  = treatmentJournalToFeedback({ rating: 3, effects: ["mood", "bodyCalm", "antiAnxiety"], side_effects: [] });
    const withNothing = treatmentJournalToFeedback({ rating: 3, effects: [], side_effects: [] });
    expect(withOther.painRelief).toBe(withNothing.painRelief);
    expect(withOther.sleepQuality).toBe(withNothing.sleepQuality);
  });
});

// ── D. Side_effects mapping ───────────────────────────────────────────────────
describe("D — side_effects map to anxietyTriggered and efficacy penalty", () => {
  it("each non-anxiety side_effect reduces efficacy by 2", () => {
    const base     = treatmentJournalToFeedback({ rating: 4, effects: [], side_effects: [] });
    const oneSide  = treatmentJournalToFeedback({ rating: 4, effects: [], side_effects: ["foggy"] });
    const twoSide  = treatmentJournalToFeedback({ rating: 4, effects: [], side_effects: ["foggy", "headache"] });
    expect(base.efficacy    - oneSide.efficacy).toBe(2);
    expect(oneSide.efficacy - twoSide.efficacy).toBe(2);
  });

  it("efficacy never goes below 0 even with many side_effects", () => {
    const feedback = treatmentJournalToFeedback({
      rating: 1,
      effects: [],
      side_effects: ["foggy", "headache", "nausea", "dizzy", "dry_mouth", "munchies"],
    });
    expect(feedback.efficacy).toBe(0);
  });

  it("anxiety does NOT add to the efficacy penalty (it's the hard-negative path)", () => {
    const onlyAnxiety    = treatmentJournalToFeedback({ rating: 4, effects: [], side_effects: ["anxiety"] });
    const anxietyPlusFog = treatmentJournalToFeedback({ rating: 4, effects: [], side_effects: ["anxiety", "foggy"] });
    // anxiety alone: efficacy unchanged (adverseCount = 0); foggy adds the penalty
    const base = treatmentJournalToFeedback({ rating: 4, effects: [], side_effects: [] });
    expect(onlyAnxiety.efficacy).toBe(base.efficacy);
    expect(anxietyPlusFog.efficacy).toBe(base.efficacy - 2);
  });
});

// ── E. Integration with updateUserDNAProfile ─────────────────────────────────
describe("E — integration: feedback drives real profile changes in updateUserDNAProfile", () => {
  const BLANK_PROFILE = {
    target_terpenes: {}, trigger_terpenes: {}, target_genetics: {},
    target_vector: new Array(12).fill(0), indications: [], report_count: 0,
  };
  const STRAIN_WITH_MYRCENE = {
    lineage:   "OG Kush",
    embedding: [0, 0, 0, 0, 0.6, 0, 0, 0.3, 0, 0, 0, 0], // high myrcene (idx 4)
  };

  it("high rating → positive reinforcement: target_terpenes increase", () => {
    const feedback = treatmentJournalToFeedback({ rating: 5, effects: ["sleep"], side_effects: [] });
    const profile  = updateUserDNAProfile(BLANK_PROFILE, STRAIN_WITH_MYRCENE, feedback);
    expect(profile.target_terpenes.myrcene ?? 0).toBeGreaterThan(0);
  });

  it("anxiety side_effect → myrcene in trigger_terpenes (hard negative)", () => {
    const feedback = treatmentJournalToFeedback({ rating: 4, effects: [], side_effects: ["anxiety"] });
    const profile  = updateUserDNAProfile(BLANK_PROFILE, STRAIN_WITH_MYRCENE, feedback);
    expect(profile.trigger_terpenes.myrcene ?? 0).toBeGreaterThan(0);
  });

  it("low rating + multiple side_effects → target_terpenes do not increase (pos below threshold)", () => {
    const feedback = treatmentJournalToFeedback({
      rating: 2,
      effects: [],
      side_effects: ["foggy", "headache", "nausea"],
    });
    const profile = updateUserDNAProfile(BLANK_PROFILE, STRAIN_WITH_MYRCENE, feedback);
    // pos is very low → no positive reinforcement
    expect(profile.target_terpenes.myrcene ?? 0).toBeLessThanOrEqual(0);
  });
});
