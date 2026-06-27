/**
 * seedIngestor.js — Stub for pharmacist/admin seeded community reports (C3).
 *
 * TODO: injectSeedReport requires a curated dataset that is not yet available.
 *   Required input fields:
 *     { strain_id: UUID, efficacy: 1-5, side_effects: string[], effects: string[] }
 *   Behavior when implemented:
 *     INSERT into user_reviews with is_seed=true, user_id=NULL (or a dedicated seed user).
 *     No user_id association — seed reports are anonymous at origin.
 *   Do NOT call this function until the dataset has been reviewed and approved.
 *
 * This stub throws to make accidental calls immediately visible in dev/staging.
 * It has no effect on any live user flow.
 */
export async function injectSeedReport(_payload, _pool) {
  throw new Error(
    "seedIngestor.injectSeedReport: not implemented — awaiting curated pharmacist dataset",
  );
}
