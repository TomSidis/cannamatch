/**
 * treatmentJournalFeedback.js — Phase C2: maps a treatment journal entry to the
 * feedback format expected by updateUserDNAProfile (api/lib/dnaProfile.js).
 *
 * Called from POST /treatment and PATCH /treatment/:id.
 *
 * NEVER receives: notes, side_effects_other — those columns are private and must
 * not reach the DNA profile. The function signature makes this structurally
 * impossible: it only destructures { rating, effects, side_effects }.
 *
 * side_effects are as important as effects — they prevent re-recommendation of a
 * strain that didn't fit. Both are funneled to the profile, not just the positive.
 */

/**
 * @param {{ rating: number, effects?: string[], side_effects?: string[] }} entry
 * @returns {{ efficacy: number, painRelief: number, sleepQuality: number, anxietyTriggered: boolean, indication: null }}
 */
export function treatmentJournalToFeedback({ rating, effects = [], side_effects = [] }) {
  // rating (1-5) → efficacy in the 2-10 range used by updateUserDNAProfile.
  // pos threshold for "strong positive" in the engine is 0.4 (= 6/15 when painRelief/sleepQuality=0).
  // rating 4 → efficacy 8 → pos 0.53 → positive reinforcement. rating 2 → pos 0.27 → decay.
  const baseEfficacy = rating * 2;

  // Positive effect dimensions → boost therapeutic Likert fields
  const painRelief   = effects.includes("antiPain") ? 5 : 0;
  const sleepQuality = effects.includes("sleep")    ? 5 : 0;

  // "anxiety" side-effect → hard negative (same anxietyTriggered signal as community reviews)
  const anxietyTriggered = side_effects.includes("anxiety");

  // Every other adverse side-effect penalizes efficacy so pos drops below the 0.4 threshold,
  // causing the engine to decay target terpenes and prevent re-recommendation.
  const adverseCount  = side_effects.filter((id) => id !== "anxiety").length;
  const efficacy      = Math.max(0, baseEfficacy - adverseCount * 2);

  return { efficacy, painRelief, sleepQuality, anxietyTriggered, indication: null };
}
