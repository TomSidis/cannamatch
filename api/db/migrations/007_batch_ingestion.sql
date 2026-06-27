-- Migration 007: Batch Ingestion pipeline
-- grow_batch, production_batch, manufacturer_registry, scrape_run_log
-- Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

-- ── manufacturer_registry ──────────────────────────────────────────────────────
-- One row per manufacturer whose COA pages we scrape.
-- FOUNDER: extend this table, not the code, when adding new manufacturers.
CREATE TABLE IF NOT EXISTS manufacturer_registry (
  id             TEXT PRIMARY KEY,               -- slug: 'seach', 'peace-naturals'
  display_name   TEXT NOT NULL,
  batches_url    TEXT NOT NULL,                  -- URL of the COA listing page
  parser_type    TEXT NOT NULL DEFAULT 'html'
                 CHECK (parser_type IN ('html', 'pdf', 'image', 'api', 'manual_only')),
  scrape_status  TEXT NOT NULL DEFAULT 'pending'
                 CHECK (scrape_status IN ('ok', 'failed', 'pending', 'blocked', 'manual_only')),
  last_scraped   TIMESTAMPTZ,
  last_error     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── grow_batch ─────────────────────────────────────────────────────────────────
-- Tier 1: growth unit (per Ministry of Health definitions).
-- tehelet-greenhouse ≠ tehelet-hydro → separate rows with same genetics_id.
-- provenance hierarchy: measured (signed COA point value) > declared > derived.
CREATE TABLE IF NOT EXISTS grow_batch (
  id               TEXT PRIMARY KEY,             -- grow batch number from COA (e.g. "SH-2024-042")
  genetics_id      TEXT REFERENCES genetics_node(id) ON DELETE SET NULL,
  cultivator       TEXT NOT NULL,
  cultivation_method TEXT
                   CHECK (cultivation_method IN ('indoor','outdoor','greenhouse','hybrid_grow')),
  irradiation      BOOLEAN,
  grow_season      TEXT,                         -- 'spring 2024', 'autumn 2024', etc.
  thc_pct          NUMERIC(5,2),
  cbd_pct          NUMERIC(5,2),
  terpenes         JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- effect_vec computed from terpenes by engine; NULL until populated
  effect_vec       JSONB,
  provenance       TEXT NOT NULL DEFAULT 'declared'
                   CHECK (provenance IN ('measured', 'declared', 'derived')),
  coa_url          TEXT,
  coa_fetched_at   TIMESTAMPTZ,
  manufacturer_id  TEXT REFERENCES manufacturer_registry(id) ON DELETE SET NULL,
  raw_coa_text     TEXT,                         -- original COA text for re-parsing if needed
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grow_batch_genetics     ON grow_batch (genetics_id);
CREATE INDEX IF NOT EXISTS idx_grow_batch_manufacturer ON grow_batch (manufacturer_id);
CREATE INDEX IF NOT EXISTS idx_grow_batch_provenance   ON grow_batch (provenance);

-- ── production_batch ───────────────────────────────────────────────────────────
-- Tier 2: commercial packaged unit (may blend multiple grow batches).
CREATE TABLE IF NOT EXISTS production_batch (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id           TEXT,                         -- commercial product SKU
  grow_batch_ids   TEXT[] NOT NULL DEFAULT '{}', -- FK to grow_batch.id[]
  packaged_at      TIMESTAMPTZ,
  coa_url          TEXT,
  manufacturer_id  TEXT REFERENCES manufacturer_registry(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prod_batch_sku ON production_batch (sku_id);

-- ── scrape_run_log ─────────────────────────────────────────────────────────────
-- One row per daily scrape run. Used for the morning report.
CREATE TABLE IF NOT EXISTS scrape_run_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  new_batches           INTEGER NOT NULL DEFAULT 0,
  measured_count        INTEGER NOT NULL DEFAULT 0,
  declared_count        INTEGER NOT NULL DEFAULT 0,
  failed_manufacturers  TEXT[] NOT NULL DEFAULT '{}',
  details               JSONB                    -- per-manufacturer breakdown
);

CREATE INDEX IF NOT EXISTS idx_scrape_log_run_at ON scrape_run_log (run_at DESC);

-- ── Seed manufacturer_registry ─────────────────────────────────────────────────
-- FOUNDER: verify URLs + parser_type before first production run.
-- Add rows for the remaining ~20 Israeli manufacturers.
INSERT INTO manufacturer_registry (id, display_name, batches_url, parser_type) VALUES
  ('seach',          'שיח (Seach)',           'https://seach.co.il/products/batches/',                                           'html'),
  ('peace-naturals', 'Peace Naturals',        'https://peacenaturals.co.il/our-products/all/production-batches-clarification/', 'html'),
  ('canndoc',        'Canndoc',               'https://canndoc.co.il/batches',                                                   'html'),
  ('tikun-olam',     'תיקון עולם',            'https://tikun-olam.co.il/product-list',                                           'html'),
  ('bazelet',        'בזלת (Bazelet)',        'https://bazelet.co.il/batches',                                                   'html'),
  ('imc',            'IMC (Israel Medical Cannabis)', 'https://imc-group.com.au/batch-information',                             'html'),
  ('cnc',            'CNC (Cannabis Natura Care)', 'https://cnc.org.il/batches',                                                'html'),
  ('canabeer',       'Canabeer',              'https://canabeer.co.il/lot',                                                      'html'),
  ('gemmacert',      'GemmaCert',             'https://gemmacert.com/batches',                                                   'html'),
  ('solo',           'Solo (Cannabis)',        'https://solo-cannabis.co.il/batches',                                             'html'),
  ('together',       'Together (תוגדר)',       'https://together.co.il/batches',                                                  'html'),
  ('pharma',         'Pharma Seach',          'https://pharmaseach.co.il/coa',                                                   'html'),
  ('greenmediterra', 'Green MediTerra',        'https://greenmediterra.co.il/coa-downloads',                                     'pdf'),
  ('teva-natur',     'Teva Natur',            'https://tevanatur.co.il/products',                                                'html')
ON CONFLICT (id) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      batches_url  = EXCLUDED.batches_url,
      parser_type  = EXCLUDED.parser_type,
      updated_at   = now();
