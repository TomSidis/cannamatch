-- Migration 011 — Treatment Journal (Phase C2)
--
-- Creates treatment_journal: private, per-user experience log linked to a strain/product.
-- Separate from bio_journal (clinical dose/route table) — do not merge.
--
-- grow_batch_id: TEXT NULL, soft reference to grow_batch.id.
--   Using TEXT (not FK) for resilience: user may not know the batch, and grow_batch
--   may not exist in all environments.
--
-- side_effects_other: free-text "other" input. Stored here, NEVER fed to DNA profile.
-- notes: free-text private memo. Stored here, NEVER fed to DNA profile.
--
-- Safe to run multiple times (IF NOT EXISTS guards on all DDL).

CREATE TABLE IF NOT EXISTS treatment_journal (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  strain_id          UUID         NOT NULL REFERENCES strains(id),
  grow_batch_id      TEXT         NULL,
  rating             SMALLINT     NOT NULL CHECK (rating BETWEEN 1 AND 5),
  photo_url          TEXT         NULL,
  notes              TEXT         NULL,
  effects            TEXT[]       NULL,
  side_effects       TEXT[]       NULL,
  side_effects_other TEXT         NULL,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Per-user descending index — the primary access pattern (GET /api/journal/treatment)
CREATE INDEX IF NOT EXISTS idx_treatment_journal_user
  ON treatment_journal (user_id, created_at DESC);

-- Per-strain index — for future "how did this strain affect me?" lookup
CREATE INDEX IF NOT EXISTS idx_treatment_journal_strain
  ON treatment_journal (user_id, strain_id);
