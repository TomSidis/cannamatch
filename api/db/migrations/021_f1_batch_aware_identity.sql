-- Migration 021: F1.1 — batch-aware identity on product_sku + pending_product
--
-- RULE: A commercial name is NOT unique. The sellable record identity is
--   (normalized_name, batch_id).
--   Same name + same batch  → one row (UPSERT).
--   Same name + diff batch  → two legitimate rows.
--   Unknown batch           → batch_id = 'unknown' (sentinel, NOT NULL).
--   Two same-name + both unknown → one row (unique fires correctly on the sentinel).
--
-- CHANGES:
--   1. product_sku  — drop UNIQUE(normalized_name); add batch_id; add UNIQUE(normalized_name, batch_id).
--   2. pending_product — same treatment.
--
-- batch_id is a soft TEXT reference to grow_batch.id.
-- No FK constraint: scraper may see a commercial name before its batch is ingested.
-- Sentinel 'unknown' means "batch not yet identified — pending admin backfill".
--
-- Safe to run multiple times (ADD COLUMN IF NOT EXISTS; constraints guarded by DO blocks).

-- ── 1. product_sku ─────────────────────────────────────────────────────────────

ALTER TABLE product_sku
  ADD COLUMN IF NOT EXISTS batch_id TEXT NOT NULL DEFAULT 'unknown';

COMMENT ON COLUMN product_sku.batch_id IS
  'grow_batch.id for this SKU, or the sentinel ''unknown'' when the batch is not yet identified. '
  'Together with normalized_name forms the unique identity of a sellable record. '
  'Soft reference (no FK) — batch may be ingested after the SKU is first seen.';

-- Drop the old single-column unique constraint (name alone is not a unique identity)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'product_sku'::regclass
      AND conname  = 'product_sku_normalized_name_key'
  ) THEN
    ALTER TABLE product_sku DROP CONSTRAINT product_sku_normalized_name_key;
  END IF;
END;
$$;

-- Add the correct two-column unique constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'product_sku'::regclass
      AND conname  = 'product_sku_name_batch_key'
  ) THEN
    ALTER TABLE product_sku
      ADD CONSTRAINT product_sku_name_batch_key UNIQUE (normalized_name, batch_id);
  END IF;
END;
$$;

-- ── 2. pending_product ─────────────────────────────────────────────────────────

ALTER TABLE pending_product
  ADD COLUMN IF NOT EXISTS batch_id TEXT NOT NULL DEFAULT 'unknown';

COMMENT ON COLUMN pending_product.batch_id IS
  'grow_batch.id for this pending entry, or ''unknown''. '
  'Forms the unique identity together with normalized_name.';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'pending_product'::regclass
      AND conname  = 'pending_product_normalized_name_key'
  ) THEN
    ALTER TABLE pending_product DROP CONSTRAINT pending_product_normalized_name_key;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'pending_product'::regclass
      AND conname  = 'pending_product_name_batch_key'
  ) THEN
    ALTER TABLE pending_product
      ADD CONSTRAINT pending_product_name_batch_key UNIQUE (normalized_name, batch_id);
  END IF;
END;
$$;
