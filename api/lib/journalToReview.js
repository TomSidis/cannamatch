/**
 * journalToReview.js — Privacy gateway for C3 community sharing.
 *
 * Maps a private treatment_journal entry to a user_reviews INSERT payload.
 *
 * Structural privacy contract:
 *   - `notes` is NOT a parameter — it cannot reach the output.
 *   - `side_effects_other` is NOT a parameter — it cannot reach the output.
 *   Only closed-list fields (effects[], side_effects[]) and metadata pass through.
 *
 * This function is pure: no DB access, no side effects.
 */
export function journalToReviewPayload({
  strain_id,
  rating,
  effects      = [],
  side_effects = [],
  photo_url,
  grow_batch_id,
}) {
  return {
    strain_id,
    efficacy:          rating,   // 1–5 direct — user_reviews.efficacy CHECK BETWEEN 1 AND 5
    anxiety_triggered: side_effects.includes("anxiety"),
    // pain_relief / sleep_quality: journal records presence (binary), not intensity (1-5).
    // Mapping a binary signal to a numeric Likert score would invent data the user didn't give.
    // NULL = "not reported at this granularity" — the DB column is nullable.
    pain_relief:  null,
    sleep_quality: null,
    side_effects,              // closed list — validated upstream by journalConfig.js
    photo_url:     photo_url    ?? null,
    batch_id:      grow_batch_id ?? null,
  };
}
