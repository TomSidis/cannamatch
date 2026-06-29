-- Migration 015: Commercial product SKU catalog + pending review queue
-- product_sku   — alias table (commercial name → genetics_node)
-- pending_product — new names awaiting admin classification
-- sku_source    — catalog of scrape sources
-- Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

-- ── sku_source ─────────────────────────────────────────────────────────────────
-- One row per scrape source. Priority: lower = higher trust (1=MOH, 2=cannabiz…).
CREATE TABLE IF NOT EXISTS sku_source (
  id          TEXT PRIMARY KEY,            -- slug: 'cannabiz-new', 'cannabiz-catalog'
  display_name TEXT NOT NULL,
  url          TEXT NOT NULL,
  priority     SMALLINT NOT NULL DEFAULT 5, -- 1 = most trusted
  parser_type  TEXT NOT NULL DEFAULT 'html'
               CHECK (parser_type IN ('html', 'json', 'pdf', 'manual')),
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_scraped TIMESTAMPTZ,
  last_error   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO sku_source (id, display_name, url, priority, parser_type) VALUES
  ('cannabiz-new',     'Cannabiz חדש בשוק',    'https://cannabiz.co.il/%D7%96%D7%A0%D7%99%D7%9D-%D7%97%D7%93%D7%A9%D7%99%D7%9D-%D7%96%D7%A0%D7%99-%D7%A7%D7%A0%D7%90%D7%91%D7%99%D7%A1-%D7%A9%D7%A0%D7%9B%D7%A0%D7%A1%D7%95-%D7%9C%D7%9E%D7%9C%D7%90%D7%99-%D7%9C%D7%90%D7%97/', 2, 'html'),
  ('cannabiz-catalog', 'Cannabiz קטלוג',        'https://cannabiz.co.il/shop/', 3, 'html'),
  ('easy-cannabis',    'Easy Cannabis מוצרים',  'https://easycannabis.co.il/products', 4, 'html')
ON CONFLICT (id) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      url          = EXCLUDED.url,
      priority     = EXCLUDED.priority;

-- ── product_sku ────────────────────────────────────────────────────────────────
-- Commercial name (as branded/marketed) → resolved genetics_node.
-- match_confidence: 1.0=same name, 0.9=declared lineage, 0.7=fuzzy, 0=unresolved.
CREATE TABLE IF NOT EXISTS product_sku (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commercial_name  TEXT NOT NULL,
  normalized_name  TEXT NOT NULL,              -- lowercased + stripped for dedup
  genetics_id      TEXT REFERENCES genetics_node(id) ON DELETE SET NULL,
  match_confidence NUMERIC(3,2) NOT NULL DEFAULT 0.0
                   CHECK (match_confidence BETWEEN 0 AND 1),
  match_method     TEXT CHECK (match_method IN ('exact', 'declared_lineage', 'fuzzy', 'manual', NULL)),
  grower           TEXT,
  marketer         TEXT,
  brand            TEXT,
  category         TEXT,                       -- T-C dosage if declared
  terpene_rank     TEXT[],                     -- dominant terpene order (not %)
  source_id        TEXT REFERENCES sku_source(id) ON DELETE SET NULL,
  first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  status           TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'discontinued', 'pending')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (normalized_name)
);

CREATE INDEX IF NOT EXISTS idx_sku_genetics     ON product_sku (genetics_id);
CREATE INDEX IF NOT EXISTS idx_sku_first_seen   ON product_sku (first_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_sku_source       ON product_sku (source_id);
CREATE INDEX IF NOT EXISTS idx_sku_name_trgm    ON product_sku USING gin (commercial_name gin_trgm_ops);

-- ── pending_product ────────────────────────────────────────────────────────────
-- New names seen by scraper that haven't been classified yet.
-- Admin reviews these; on approval they become product_sku rows.
CREATE TABLE IF NOT EXISTS pending_product (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commercial_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  raw_context     TEXT,                        -- surrounding HTML/text for context
  source_id       TEXT REFERENCES sku_source(id),
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  auto_genetics_id TEXT REFERENCES genetics_node(id) ON DELETE SET NULL,
  auto_confidence NUMERIC(3,2) DEFAULT 0.0,
  auto_method     TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected', 'duplicate')),
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pending_status    ON pending_product (status, first_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_pending_source    ON pending_product (source_id);

-- ── sku_scrape_log ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sku_scrape_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_id   TEXT,
  new_pending INTEGER NOT NULL DEFAULT 0,
  new_approved INTEGER NOT NULL DEFAULT 0,
  total_seen  INTEGER NOT NULL DEFAULT 0,
  error       TEXT
);
