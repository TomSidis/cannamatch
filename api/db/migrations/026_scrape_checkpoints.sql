-- Migration 026: scrape resumability infrastructure + needs_review_reason
--
-- scrape_runs: one row per ingest run (high-level metadata + status).
-- scrape_checkpoints: one row per fetched URL within a run (page-level resume cursor).
-- pending_product: adds needs_review_reason TEXT so audit can record WHY flagged.

-- ── scrape_runs ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scrape_runs (
  run_id      TEXT        PRIMARY KEY,
  source_id   TEXT        NOT NULL DEFAULT 'easy-cannabis',
  target_urls INT         NOT NULL DEFAULT 0,
  status      TEXT        NOT NULL DEFAULT 'running',  -- running / done / failed
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── scrape_checkpoints ────────────────────────────────────────────────────────
-- Stores per-URL fetch result so a crashed run can resume without re-fetching.
CREATE TABLE IF NOT EXISTS scrape_checkpoints (
  run_id       TEXT        NOT NULL REFERENCES scrape_runs(run_id) ON DELETE CASCADE,
  url          TEXT        NOT NULL,
  fetch_status TEXT        NOT NULL,   -- 'parsed' / 'skipped' / 'error'
  raw_og_title TEXT,                   -- stored verbatim when fetch_status='parsed'
  lastmod      TEXT,
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, url)
);

CREATE INDEX IF NOT EXISTS scrape_checkpoints_run_idx ON scrape_checkpoints(run_id);

-- ── pending_product: add needs_review_reason ──────────────────────────────────
ALTER TABLE pending_product
  ADD COLUMN IF NOT EXISTS needs_review_reason TEXT;
