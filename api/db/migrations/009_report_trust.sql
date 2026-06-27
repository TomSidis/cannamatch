-- Migration 009: Community report trust policy (Q11)
-- Adds verifiable trust signals to user_reviews + IMC license field on users.
-- Safe to run multiple times (ADD COLUMN IF NOT EXISTS).

-- ── users: IMC patient license ─────────────────────────────────────────────────
-- Null = unverified (anonymous or OTP-only).
-- Non-null = the user submitted their IMC license number and it was checked.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS imc_license TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_imc_license
  ON users (imc_license)
  WHERE imc_license IS NOT NULL;

-- ── user_reviews: trust evidence columns ──────────────────────────────────────
-- trust_weight: computed at submission time from the signals below.
--   0.10 = anonymous floor (no verifiable signal).
--   1.00 = verified patient + photo + valid batch number.
-- Policy: NO likes/shares threshold. Popularity ≠ clinical truth.
ALTER TABLE user_reviews
  ADD COLUMN IF NOT EXISTS trust_weight        REAL    NOT NULL DEFAULT 0.10
    CHECK (trust_weight >= 0.0 AND trust_weight <= 1.0),
  ADD COLUMN IF NOT EXISTS photo_url           TEXT,
  ADD COLUMN IF NOT EXISTS batch_id            TEXT,   -- as entered by user; NOT a FK
  ADD COLUMN IF NOT EXISTS batch_verified      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_verified_patient BOOLEAN NOT NULL DEFAULT false;

-- Retroactively set higher trust for old reviews from verified patients
-- (those that already have is_verified_patient = true via backfill if ever run).
-- For now this is a no-op; run when backfill data is available.
-- UPDATE user_reviews r SET trust_weight = 0.60
--   FROM users u WHERE r.user_id = u.id AND u.imc_license IS NOT NULL;

-- Index: fast fetch of high-trust reports per batch
CREATE INDEX IF NOT EXISTS idx_reviews_trust
  ON user_reviews (batch_id, trust_weight DESC)
  WHERE batch_id IS NOT NULL;

COMMENT ON COLUMN user_reviews.trust_weight IS
  'Computed on submission. Components: 0.10 (base) + 0.50 (IMC license) '
  '+ 0.20 (photo) + 0.20 (batch match). '
  'Feeds into weighted Bayesian aggregation in batchSignal.ts:aggregateByBatch.';
