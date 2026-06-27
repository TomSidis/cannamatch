-- Migration 010: Replace raw imc_license column with privacy-safe license fields.
--
-- BEFORE: users.imc_license TEXT stored the raw IMC license number — a PII risk.
-- AFTER:  Five derived fields only. Raw license number never touches the DB.
--
-- Privacy contract:
--   license_uniqueness_key = HMAC-SHA256(license_number, SERVER_HMAC_SECRET)
--   Deterministic → UNIQUE INDEX catches double-registration of the same license.
--   Cannot be reversed to the original license_number without SERVER_HMAC_SECRET.
--
-- Backward-compat: users who had imc_license IS NOT NULL get license_verified = true,
-- but cannot get a uniqueness key (original number is gone). They can re-verify
-- to regain full community trust weight.
--
-- Safe to run multiple times (IF NOT EXISTS / DO $$ ... $$ guards).

-- 1. Add new privacy-safe columns
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS license_verified           BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS license_uniqueness_key     TEXT,
  ADD COLUMN IF NOT EXISTS license_expiry             DATE,
  ADD COLUMN IF NOT EXISTS license_categories         TEXT[]   NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS monthly_grams_by_category  JSONB    NOT NULL DEFAULT '{}';

-- 2. Preserve verified flag, then drop the raw column
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'imc_license'
  ) THEN
    UPDATE users SET license_verified = true WHERE imc_license IS NOT NULL;
    ALTER TABLE users DROP COLUMN imc_license;
  END IF;
END $$;

-- 3. Drop old unique index (auto-dropped with column, but guard for safety)
DROP INDEX IF EXISTS idx_users_imc_license;

-- 4. Unique constraint on the HMAC key — blocks duplicate license registration
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_license_uniqueness_key
  ON users (license_uniqueness_key)
  WHERE license_uniqueness_key IS NOT NULL;

COMMENT ON COLUMN users.license_verified IS
  'True once the OCR+HMAC pipeline completes. Raw license number is never stored.';
COMMENT ON COLUMN users.license_uniqueness_key IS
  'HMAC-SHA256(license_number, SERVER_HMAC_SECRET). Uniqueness check only — not reversible without server secret.';
COMMENT ON COLUMN users.license_expiry IS
  'License expiry date extracted from OCR. Used for community contribution gating.';
COMMENT ON COLUMN users.license_categories IS
  'T/C categories (e.g. ["T22/C4"]) from OCR. Used for basket planning constraints.';
COMMENT ON COLUMN users.monthly_grams_by_category IS
  'Monthly gram quota per category (e.g. {"T22/C4": 50}). Used for basket planner ceiling.';
