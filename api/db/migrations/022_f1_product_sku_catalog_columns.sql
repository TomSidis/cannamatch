-- Migration 022: F1 — product_sku catalog columns for Israeli pharmacy seed
--
-- Adds display-only / provenance metadata fields needed by the catalog migration.
-- None of these fields feed scoring.
--
-- legacy_type: stores the menu label ("אינדיקה" / "סאטיבה" / "היברידי").
--   RULE: display only. Zero scoring weight. Never used for matching logic.
--   Comment is intentional — violating this rule is the bug.
--
-- historical_rating / n_historical_reviews: pharmacy-sourced crowd ratings.
--   Not community reports — no trust weight, no Layer 3 influence.
--   Display only (social proof text, e.g. "3.5 ★ (4 ביקורות)").
--
-- Safe to run multiple times (ADD COLUMN IF NOT EXISTS).

ALTER TABLE product_sku
  ADD COLUMN IF NOT EXISTS en_name               TEXT,
  ADD COLUMN IF NOT EXISTS country               TEXT,
  ADD COLUMN IF NOT EXISTS lineage_text          TEXT,
  ADD COLUMN IF NOT EXISTS legacy_type           TEXT,
  ADD COLUMN IF NOT EXISTS price_ils             NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS orig_price_ils        NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS pharmacies            TEXT[]    NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS forms                 TEXT[]    NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS historical_rating     NUMERIC(3,1),
  ADD COLUMN IF NOT EXISTS n_historical_reviews  INTEGER   NOT NULL DEFAULT 0;

COMMENT ON COLUMN product_sku.legacy_type IS
  'Menu label as printed: "אינדיקה" / "סאטיבה" / "היברידי". '
  'Display only — ZERO scoring weight. Not used for matching. '
  'Scientifically not predictive of effect; chemovar (chemotype + terpenes) is used instead.';

COMMENT ON COLUMN product_sku.historical_rating IS
  'Crowd rating from pharmacy menu scrape (0–5 stars). Display only. '
  'Not a community report — no Layer 3 weight.';

COMMENT ON COLUMN product_sku.n_historical_reviews IS
  'Review count accompanying historical_rating. Display only.';
