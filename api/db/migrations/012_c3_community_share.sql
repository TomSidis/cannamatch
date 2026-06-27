-- C3: Community share — add internal journal link + seed flag to user_reviews.
--
-- journal_entry_id: links a public review back to the private journal entry that
--   created it. Used for unshare (DELETE) and idempotency (prevent double-share).
--   NEVER returned in public API responses — internal only.
--
-- is_seed: distinguishes admin/pharmacist-seeded bootstrap data from real user
--   reports. Seed ingestor (api/lib/seedIngestor.js) sets this to true.
--   Real shares always use is_seed=false.
--
-- UNIQUE INDEX on journal_entry_id: enforces one public review per journal entry.

ALTER TABLE user_reviews
  ADD COLUMN IF NOT EXISTS journal_entry_id UUID NULL
    REFERENCES treatment_journal(id) ON DELETE CASCADE;

ALTER TABLE user_reviews
  ADD COLUMN IF NOT EXISTS is_seed BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_journal_entry
  ON user_reviews (journal_entry_id)
  WHERE journal_entry_id IS NOT NULL;
