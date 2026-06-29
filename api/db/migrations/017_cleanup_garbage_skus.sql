-- Migration 017: Move garbage product_sku entries to pending_product (rejected)
-- Targets: names with lot-ref chars (#), version patterns (N.N.N), or camelCase code tokens

-- Insert garbage into pending as rejected (ignore duplicates)
INSERT INTO pending_product (commercial_name, normalized_name, status)
SELECT commercial_name, normalized_name, 'rejected'
FROM product_sku
WHERE
  commercial_name ~ '#'
  OR commercial_name ~ '\d+\.\d+\.\d+'
  OR commercial_name ~ '\y[a-z][A-Z]\y'
ON CONFLICT (normalized_name) DO UPDATE SET status = 'rejected';

-- Remove those rows from the live catalog
DELETE FROM product_sku
WHERE
  commercial_name ~ '#'
  OR commercial_name ~ '\d+\.\d+\.\d+'
  OR commercial_name ~ '\y[a-z][A-Z]\y';
