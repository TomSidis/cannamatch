-- C6: Terms acceptance gate
-- Dedicated table keeps full history across versions — each accepted version
-- stays as a row. An UPDATE on users would overwrite "which version, when" and
-- destroy the audit trail needed for legal protection.

CREATE TABLE IF NOT EXISTS terms_acceptances (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  terms_version INT         NOT NULL,
  accepted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, terms_version)
);

CREATE INDEX IF NOT EXISTS idx_terms_user
  ON terms_acceptances (user_id, terms_version);
