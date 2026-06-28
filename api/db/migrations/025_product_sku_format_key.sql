-- Migration 025: add product_format to product_sku + canonical unique key
--
-- Problem: product_sku's UNIQUE(normalized_name, batch_id) is format-blind.
-- Same strain in different formats (oil / inflorescence / small) collides.
--
-- Fix:
--   1. Add product_format + format_inferred columns.
--   2. Backfill: easy-cannabis rows ← pending_product; catalog rows ← name regex.
--   3. Drop old format-blind constraint; add canonical key matching pending_product.
--
-- New key: (normalized_name, batch_id, product_format, COALESCE(grower, ''))
-- Idempotent: every step guards with IF NOT EXISTS / WHERE IS NULL / IF EXISTS.

-- ── 1. Add columns ────────────────────────────────────────────────────────────
ALTER TABLE product_sku
  ADD COLUMN IF NOT EXISTS product_format TEXT,
  ADD COLUMN IF NOT EXISTS format_inferred BOOLEAN NOT NULL DEFAULT false;

-- ── 2a. Backfill easy-cannabis rows from pending_product ──────────────────────
-- DISTINCT ON (normalized_name) picks earliest approved pending row per name,
-- approximating whichever variant successfully inserted into product_sku.
UPDATE product_sku sku
SET product_format  = sub.pf,
    format_inferred = false
FROM (
  SELECT DISTINCT ON (normalized_name)
    normalized_name,
    product_format AS pf
  FROM pending_product
  WHERE source_id = 'easy-cannabis'
    AND status    = 'approved'
    AND product_format IS NOT NULL
  ORDER BY normalized_name, created_at ASC
) sub
WHERE sku.source_id      = 'easy-cannabis'
  AND sku.normalized_name = sub.normalized_name
  AND sku.product_format IS NULL;

-- ── 2b. Fallback: any remaining easy-cannabis rows with no pending match ──────
UPDATE product_sku
SET product_format  = 'inflorescence',
    format_inferred = true
WHERE source_id     = 'easy-cannabis'
  AND product_format IS NULL;

-- ── 2c. Backfill catalog rows (source_id IS NULL) ────────────────────────────
-- Detect format from normalized_name suffix; all others default to inflorescence.
-- format_inferred=false when pattern matched (explicit); true when defaulted.
UPDATE product_sku
SET
  product_format  = CASE
    WHEN normalized_name ~ '(מיני|מיניז|סמול|small)$' THEN 'small'
    WHEN commercial_name ~* '^שמן\s'                   THEN 'oil'
    WHEN commercial_name ~* '^(קפסולות|כמוסות|קפסולה)\s' THEN 'capsule'
    WHEN commercial_name ~* '(פרירול|pre.?roll|פרה.?רול)' THEN 'pre_roll'
    ELSE 'inflorescence'
  END,
  format_inferred = CASE
    WHEN normalized_name ~ '(מיני|מיניז|סמול|small)$'
      OR commercial_name ~* '^שמן\s'
      OR commercial_name ~* '^(קפסולות|כמוסות|קפסולה)\s'
      OR commercial_name ~* '(פרירול|pre.?roll|פרה.?רול)'
    THEN false
    ELSE true
  END
WHERE source_id IS NULL
  AND product_format IS NULL;

-- ── 3. Verify backfill complete — STOP if any NULL remain ────────────────────
DO $$
DECLARE null_count INT;
BEGIN
  SELECT COUNT(*) INTO null_count FROM product_sku WHERE product_format IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION
      'Migration 025 abort: % rows still have NULL product_format after backfill. '
      'Check easy-cannabis rows with no matching pending_product entry.',
      null_count;
  END IF;
END;
$$;

-- ── 4. Set NOT NULL + default ─────────────────────────────────────────────────
ALTER TABLE product_sku
  ALTER COLUMN product_format SET NOT NULL,
  ALTER COLUMN product_format SET DEFAULT 'inflorescence';

-- ── 5. Drop old format-blind unique constraint ────────────────────────────────
ALTER TABLE product_sku
  DROP CONSTRAINT IF EXISTS product_sku_name_batch_key;

-- ── 6. New canonical unique index ─────────────────────────────────────────────
-- Matches the canonical_key used for pending_product.
-- COALESCE(grower, '') makes NULLs deterministic (rows without grower still dedup).
CREATE UNIQUE INDEX IF NOT EXISTS product_sku_canonical_key
  ON product_sku(normalized_name, batch_id, product_format, COALESCE(grower, ''));
