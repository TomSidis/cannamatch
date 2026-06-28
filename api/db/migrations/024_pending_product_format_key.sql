-- Migration 024: include product_format in pending_product unique key.
--
-- Problem: two rows with same (normalized_name, batch_id) but different product_format
-- (e.g. same strain as oil + inflorescence) collide on the old UNIQUE(normalized_name, batch_id).
--
-- Fix: replace with a functional unique index on
--   (normalized_name, batch_id, COALESCE(product_format, ''))
-- so NULL product_format (strainDetectionJob rows) deduplicates normally,
-- and different formats for the same strain coexist.

-- Drop the old named unique constraint from migration 021.
ALTER TABLE pending_product
  DROP CONSTRAINT IF EXISTS pending_product_name_batch_key;

-- New functional unique index.
-- COALESCE maps NULL → '' so detection-job rows still dedup by (name, batch).
CREATE UNIQUE INDEX IF NOT EXISTS pending_product_name_batch_format_key
  ON pending_product(normalized_name, batch_id, COALESCE(product_format, ''));
