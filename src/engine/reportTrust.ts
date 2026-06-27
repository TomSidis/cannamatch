/**
 * reportTrust.ts — Q11: Community report trust policy.
 *
 * Policy summary:
 *   - Anonymous reports ALLOWED at a near-zero base weight.
 *   - Each report receives a trust weight before entering Bayesian aggregation.
 *   - Weight rises with verifiable evidence: IMC license + photo + batch match.
 *   - NO likes/shares threshold: popularity measures engagement, not clinical truth;
 *     a threshold would suppress rare but high-value adverse reports.
 *   - Bayesian k=8 in scorer.ts already provides troll resistance at the
 *     aggregation layer — this module operates at the per-report layer.
 *
 * LAYER 2 HOOK (deferred):
 *   getUserReliabilityScore() is a stub returning undefined today.
 *   When labeled training data is available, replace with a DB lookup that
 *   returns a per-user reliability score from the behavioral model.
 */

export interface ReportSignals {
  isVerifiedPatient: boolean; // IMC patient license confirmed in system
  hasPhoto:          boolean; // photo of the product/report attached
  batchVerified:     boolean; // batch_id cross-referenced against grow_batch DB
  // LAYER 2 HOOK: 0..1 reliability from behavioral model. undefined = treat as 1.0.
  userReliabilityScore?: number;
}

const W_BASE    = 0.10; // anonymous floor — every report contributes, minimally
const W_LICENSE = 0.50; // strongest signal: verified patient in the system
const W_PHOTO   = 0.20; // effort + accountability signal
const W_BATCH   = 0.20; // COA batch match → specific product knowledge

/**
 * Trust display thresholds — single source of truth for both backend and UI.
 * Use these in feed ranking labels and UI indicators; do not hardcode in components.
 */
export const TRUST_THRESHOLDS = {
  HIGH:   0.70, // verified patient ± photo/batch → "דיווח מאומת"
  MEDIUM: 0.40, // partial signals             → "דיווח חלקי"
  // below MEDIUM                              → "דיווח בסיסי"
} as const;

/**
 * Compute the trust weight for a single community report.
 * Return value is clamped to [0.10, 1.00].
 */
export function computeReportWeight(signals: ReportSignals): number {
  const raw =
    W_BASE +
    (signals.isVerifiedPatient ? W_LICENSE : 0) +
    (signals.hasPhoto          ? W_PHOTO   : 0) +
    (signals.batchVerified     ? W_BATCH   : 0);
  // Layer 2 hook: multiply by behavioral reliability when available
  const reliability = signals.userReliabilityScore ?? 1.0;
  return Math.min(1.0, Math.max(W_BASE, raw * reliability));
}

/**
 * LAYER 2 HOOK — behavioral user reliability model.
 * Returns undefined today (treated as 1.0 by computeReportWeight).
 * Replace with a real DB lookup once labeled training data is available.
 *
 * // DEFERRED to Layer 2 — behavioral trust learning, requires labeled report data
 */
export async function getUserReliabilityScore(
  _userId: string, // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<number | undefined> {
  return undefined;
}
