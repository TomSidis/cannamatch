-- Migration 020: F1 — test_method, region, external-research isolation
--
-- Three additions to grow_batch:
--   1. test_method  — COA terpene quantification method
--   2. region       — Israeli cultivation region (terpene expression driver)
--   3. data_source  — clinical vs external_research
--
-- Isolation is TWO structural layers, not a convention:
--   Layer 1 (DB):    data_source CHECK IN ('clinical','external_research')
--                    — DB rejects any other value at write time.
--   Layer 2 (VIEW):  community_eligible_batches pre-filters data_source='clinical'.
--                    All Layer 3/4 community aggregations MUST query through this VIEW.
--                    A query that forgets the filter still sees only clinical rows.
--
-- RULE: external_research rows feed Layer 1 priors only.
--       They MUST NEVER appear in user_reviews aggregations or community scoring.
--
-- Safe to run multiple times (ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE VIEW).

-- ── 1. test_method ────────────────────────────────────────────────────────────
-- Terpene quantification method stated on the COA.
-- GC-MS and HS-GC-FID are the standard Israeli lab methods.
-- 'unknown' when the COA does not state the method.

ALTER TABLE grow_batch
  ADD COLUMN IF NOT EXISTS test_method TEXT NOT NULL DEFAULT 'unknown'
    CHECK (test_method IN ('GC-MS', 'HS-GC-FID', 'unknown'));

COMMENT ON COLUMN grow_batch.test_method IS
  'COA terpene quantification method: GC-MS | HS-GC-FID | unknown. '
  'Display and data-quality metadata only — does NOT affect scoring weights.';

-- ── 2. region ─────────────────────────────────────────────────────────────────
-- Israeli cultivation region. Affects terpene expression via solar intensity
-- and humidity (see cultivation_modifier for the quantity-scale companion).
-- Nullable — COAs rarely state region explicitly; populated by scraper when found.

ALTER TABLE grow_batch
  ADD COLUMN IF NOT EXISTS region TEXT;

COMMENT ON COLUMN grow_batch.region IS
  'Israeli cultivation region (e.g. north, center, south, negev, arava). '
  'Nullable — rarely stated on COA. Informational metadata only.';

-- ── 3. data_source — DB-level guard (Layer 1) ─────────────────────────────────
-- Every grow_batch row must declare whether it is:
--   'clinical'           — a real licensed product eligible for user reviews +
--                          Layer 3 community scoring.
--   'external_research'  — data sourced from a study or literature; feeds
--                          Layer 1 genetics prior ONLY. NEVER in community layer.

ALTER TABLE grow_batch
  ADD COLUMN IF NOT EXISTS data_source TEXT NOT NULL DEFAULT 'clinical'
    CHECK (data_source IN ('clinical', 'external_research'));

COMMENT ON COLUMN grow_batch.data_source IS
  'clinical = real product; eligible for Layer 3 community aggregation. '
  'external_research = study/literature data; Layer 1 prior only. '
  'NEVER appears in community_eligible_batches VIEW. '
  'Querying grow_batch directly for community data is a bug — use the VIEW.';

-- Partial index on the minority case (external_research rows are rare).
-- Clinical rows use normal scans and existing indexes.
CREATE INDEX IF NOT EXISTS idx_grow_batch_ext_research
  ON grow_batch (data_source) WHERE data_source = 'external_research';

-- ── 4. community_eligible_batches — VIEW-level guard (Layer 2) ────────────────
-- All Layer 3/4 community aggregation queries MUST read from this VIEW.
-- external_research rows are structurally absent — isolation cannot be forgotten.
--
-- Callers: social.js, recommendations.js, catalog.js community-stats,
--          any future route that aggregates user_reviews by batch.

CREATE OR REPLACE VIEW community_eligible_batches AS
  SELECT * FROM grow_batch
  WHERE data_source = 'clinical';

COMMENT ON VIEW community_eligible_batches IS
  'Layer 3/4 safe query surface: grow_batch pre-filtered to data_source=clinical. '
  'Use this view — not the raw table — for all community aggregations. '
  'external_research rows are invisible here by design.';
