/**
 * anomalyHooks.js — Phase C1: Community anomaly detection hooks.
 *
 * ALL HOOKS ARE STUBS TODAY — each returns undefined.
 * computeReportWeight() in reportTrust.ts treats undefined as userReliabilityScore = 1.0
 * (no adjustment), so the review flow is unchanged until data is available.
 *
 * Connection to reportTrust.ts:
 *   aggregateAnomalyScore() → userReliabilityScore → ReportSignals.userReliabilityScore
 *   → computeReportWeight(). Trust arithmetic stays in reportTrust.ts; no duplication.
 *
 * When to implement each hook: see TODO comments. All three require production data
 * before thresholds can be calibrated without false positives.
 */

/**
 * HOOK A — Review velocity: new account rating many products quickly.
 *
 * TODO (Layer 2, requires labeled data):
 *   - Query user_reviews WHERE user_id=$1 AND created_at > now() - interval '24 hours'
 *   - Query user_reviews WHERE user_id=$1 AND created_at > now() - interval '7 days'
 *   - Query users.created_at to compute account age
 *   - Return reduced multiplier if velocity > age-adjusted threshold
 *     (e.g. >5 reviews/day on account <7 days old → score 0.4)
 *   - Calibrate thresholds against labeled false-positive set before deploying
 *
 * @param {string} userId
 * @param {object} pool  pg Pool or client — query interface
 * @returns {Promise<number | undefined>}  0..1 reliability multiplier; undefined = no signal
 */
export async function checkReviewVelocity(userId, pool) {
  // TODO: implement velocity check — see comment above
  return undefined;
}

/**
 * HOOK B — Geographic flood: mass submissions from one region in a short window.
 *
 * TODO (Layer 2, blocked on privacy decision):
 *   - Requires IP / region metadata on review submission
 *   - Currently NOT stored — storing IP hash requires a privacy-conscious schema change
 *     and user disclosure (privacy trade-off; needs separate decision by Tom before building)
 *   - Once available: query region_flood_stats view or Redis sliding-window counter
 *   - Return reduced multiplier if region count > threshold in last 1h
 *
 * @param {string} userId
 * @param {object} pool
 * @returns {Promise<number | undefined>}
 */
export async function checkGeographicFlood(userId, pool) {
  // TODO: implement geographic flood check — blocked on IP collection decision
  return undefined;
}

/**
 * HOOK C — Profile inconsistency: reported effect is a strong outlier vs. DNA profile.
 *
 * TODO (Layer 2, requires ≥5 historical reports per user):
 *   - Load user_dna_profiles.profile and strains.terpene_dist for the reviewed strain
 *   - Compute expected efficacy range (reuse scorer.ts logic, don't reimplement)
 *   - Return reduced multiplier if reported efficacy is >2σ from expected
 *   - Only active once user has enough reports for a reliable baseline
 *
 * @param {string} userId
 * @param {string|null} strainId
 * @param {object} pool
 * @returns {Promise<number | undefined>}
 */
export async function checkProfileInconsistency(userId, strainId, pool) {
  // TODO: implement profile consistency check — see comment above
  return undefined;
}

/**
 * Aggregate all anomaly hooks into a single userReliabilityScore.
 *
 * Strategy: most conservative signal wins (min of all non-undefined scores).
 * If all hooks return undefined → returns undefined → computeReportWeight uses 1.0.
 *
 * Hook failures are isolated via Promise.allSettled — a crashing hook
 * does not abort the review submission.
 *
 * @param {string} userId
 * @param {object} pool
 * @param {{ strainId?: string }} [ctx]
 * @returns {Promise<number | undefined>}
 */
export async function aggregateAnomalyScore(userId, pool, { strainId = null } = {}) {
  const results = await Promise.allSettled([
    checkReviewVelocity(userId, pool),
    checkGeographicFlood(userId, pool),
    checkProfileInconsistency(userId, strainId, pool),
  ]);

  const scores = results
    .filter((r) => r.status === "fulfilled" && r.value !== undefined)
    .map((r) => r.value);

  return scores.length === 0 ? undefined : Math.min(...scores);
}
