-- Migration 027: register 'user-scan' as a valid sku_source.
--
-- The /api/pending-scan route (Task 1a — user-triggered ingestion of unknown scanned
-- strains) inserts pending_product rows with source_id = 'user-scan'. pending_product.source_id
-- is a FK to sku_source(id); without this row every user-scan insert fails the FK and the
-- unknown strain never reaches the review queue.
--
-- This adds ONLY a new source row; it does not touch the scraper's own sources
-- (cannabiz-catalog / cannabiz-new / easy-cannabis) or any pending_product data.
-- Idempotent: ON CONFLICT DO NOTHING.

INSERT INTO sku_source (id, display_name, url, priority, parser_type, active)
VALUES ('user-scan', 'סריקת משתמש', 'app://user-scan', 9, 'manual', true)
ON CONFLICT (id) DO NOTHING;
