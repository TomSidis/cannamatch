-- Migration 008: Provenance enum canonicalization + cultivation inheritance tracking
-- Q1: rename 'derived' → 'inferred' in grow_batch.provenance CHECK constraint.
-- New: cultivation_inherited column for batches that inherit grow method from a sibling.
-- Safe to run multiple times (IF NOT EXISTS / explicit constraint drop-add).

-- ── grow_batch.provenance: rename 'derived' → 'inferred' ──────────────────────
-- PG does not support ALTER CONSTRAINT; drop + backfill + re-add.
ALTER TABLE grow_batch DROP CONSTRAINT IF EXISTS grow_batch_provenance_check;
UPDATE grow_batch SET provenance = 'inferred' WHERE provenance = 'derived';
ALTER TABLE grow_batch
  ADD CONSTRAINT grow_batch_provenance_check
  CHECK (provenance IN ('measured', 'declared', 'inferred'));

-- ── cultivation_inherited flag ─────────────────────────────────────────────────
-- TRUE when cultivation_method was propagated from the most-recent sibling batch
-- (same genetics_id) that had measured terpene data.  Inherited cultivation
-- reduces scorer confidence within the 'inferred' tier.
ALTER TABLE grow_batch
  ADD COLUMN IF NOT EXISTS cultivation_inherited BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN grow_batch.cultivation_inherited IS
  'TRUE when cultivation_method was inherited from the most-recent sibling batch '
  '(same genetics_id) that contained measured terpene data. '
  'Scorer applies a 0.85× confidence penalty to these batches within the inferred tier.';

-- ── Index: fast sibling lookup during ingestion ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_grow_batch_genetics_terps
  ON grow_batch (genetics_id, created_at DESC)
  WHERE terpenes != '{}'::jsonb AND cultivation_method IS NOT NULL;
