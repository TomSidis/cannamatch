-- Migration 023: catalog ingestion hardening
--
-- 1. Adds parse-result columns to pending_product (raw source preserved, never mutated).
-- 2. Creates strain_aliases table for canonical deduplication.
-- 3. Adds canonical_key unique index for idempotent re-runs.
-- 4. Seeds known aliases from first ingest batch.
--
-- Safe to run multiple times (IF NOT EXISTS / IF NOT EXISTS guards on every DDL).

-- ── 1. pending_product: new columns ──────────────────────────────────────────

ALTER TABLE pending_product
  ADD COLUMN IF NOT EXISTS raw_og_title   TEXT,
  ADD COLUMN IF NOT EXISTS strain_name    TEXT,
  ADD COLUMN IF NOT EXISTS product_format TEXT,
  ADD COLUMN IF NOT EXISTS tc_category    TEXT,
  ADD COLUMN IF NOT EXISTS canonical_key  TEXT,
  ADD COLUMN IF NOT EXISTS needs_review   BOOLEAN NOT NULL DEFAULT false;

-- Unique index on canonical_key — drives idempotent upserts.
-- Partial (WHERE NOT NULL) so rows without a key don't conflict with each other.
CREATE UNIQUE INDEX IF NOT EXISTS pending_product_canonical_key_uq
  ON pending_product(canonical_key)
  WHERE canonical_key IS NOT NULL;

-- ── 2. strain_aliases ─────────────────────────────────────────────────────────
-- Maps normalized alias spellings → a single canonical_name (itself normalized).
-- On ingest: normalize(parsed_name) → lookup alias_norm → use canonical_name in key.

CREATE TABLE IF NOT EXISTS strain_aliases (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name TEXT        NOT NULL,
  alias_norm     TEXT        NOT NULL,
  source         TEXT        NOT NULL DEFAULT 'manual',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (alias_norm)
);

CREATE INDEX IF NOT EXISTS strain_aliases_canonical_idx ON strain_aliases(canonical_name);

-- ── 3. Alias seed ─────────────────────────────────────────────────────────────
-- Normalized forms: lowercase, no dots/quotes, hyphens→space.
-- derived from first ingest batch (2026-06-28).

INSERT INTO strain_aliases (canonical_name, alias_norm, source) VALUES
  -- RTZ / אר.טי.זד  (grower: קנאבר)
  ('rtz', 'rtz',       'manual'),
  ('rtz', 'ארטיזד',    'manual'),   -- normalize("אר.טי.זד")
  ('rtz', 'ארטיזי',    'manual'),   -- normalize("אר.טי.זי")
  ('rtz', 'ארטייזד',   'manual'),
  ('rtz', 'ראנטז',     'manual'),
  ('rtz', 'רטז',       'manual'),

  -- CCK / ס.ס.ק  (multiple spelling variants from batch)
  ('cck', 'cck',       'manual'),
  ('cck', 'סי סי קיי', 'manual'),   -- normalize("סי סי קיי")
  ('cck', 'סיסיקיי',   'manual'),   -- normalize("סי.סי.קיי")
  ('cck', 'sskk',      'manual'),

  -- CJ / סי ג'יי  (inflorescence + small are DIFFERENT products — alias maps NAME only)
  ('cj',  'cj',        'manual'),
  ('cj',  'סי גיי',    'manual'),   -- normalize("סי ג'יי")

  -- Avidekel / אבידקל  (grower: תיקון עולם — multiple formats = multiple products)
  ('avidekel', 'avidekel', 'manual'),
  ('avidekel', 'אבידקל',   'manual'),

  -- The Dutch / הולנדי  (grower: שיח — flower + oil = different products)
  ('the dutch', 'the dutch', 'manual'),
  ('the dutch', 'הולנדי',    'manual'),
  ('the dutch', 'de dutch',  'manual')

ON CONFLICT (alias_norm) DO NOTHING;
