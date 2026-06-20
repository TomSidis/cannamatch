-- ──────────────────────────────────────────────────────────────────────────
--  CannaMatch — pg_trgm query tuning
--  Run sections top-to-bottom in a psql session against the cannamatch DB.
--  Section 1: diagnose. Section 2: configure. Section 3: create/rebuild indexes.
-- ──────────────────────────────────────────────────────────────────────────

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 1: EXPLAIN ANALYZE — baseline cost before tuning
-- ══════════════════════════════════════════════════════════════════════════

-- 1a. Commercial name fuzzy match (the hot path in POST /api/parse-menu)
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT s.id, s.name, s.genetics,
       similarity(s.name, 'ויסטה') AS sim
FROM   strains s
WHERE  s.name % 'ויסטה'
ORDER  BY sim DESC
LIMIT  3;

-- 1b. Same query with an English abbreviation (short, tricky for trgm)
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT s.id, s.name, s.genetics,
       GREATEST(similarity(s.name, 'WCK'), similarity(COALESCE(s.genetics,''), 'WCK')) AS sim
FROM   strains s
WHERE  s.name % 'WCK'
    OR s.genetics % 'WCK'
    OR 'WCK' = ANY(s.aka)
ORDER  BY sim DESC
LIMIT  1;

-- 1c. Batch fuzzy match (all names on a scanned menu at once)
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM strain_fuzzy_match(
  ARRAY['ויסטה','גרין קלובר','מד דאג','גסטרופופ','Chem D Mini'],
  0.20
);

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 2: SESSION / DATABASE CONFIGURATION
-- ══════════════════════════════════════════════════════════════════════════

-- 2a. Lower similarity threshold so short abbreviations (3-4 chars) still hit.
--     0.20 is the right floor for Hebrew 2-3 char names; below 0.15 is noise.
ALTER DATABASE cannamatch SET pg_trgm.similarity_threshold = 0.20;
-- For one-off session testing without a DB restart:
SET pg_trgm.similarity_threshold = 0.20;

-- 2b. Give the planner more room for in-memory sort/hash of 500-row strain table.
ALTER DATABASE cannamatch SET work_mem = '16MB';

-- 2c. Raise cost estimate for random I/O so GIN index is preferred over seq scan.
ALTER DATABASE cannamatch SET random_page_cost = 1.5;  -- SSD default is 4.0
ALTER DATABASE cannamatch SET effective_cache_size = '512MB';

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 3: INDEX CREATION / REBUILD WITH STORAGE PARAMETERS
-- ══════════════════════════════════════════════════════════════════════════

-- Drop and recreate the name index with explicit storage params.
-- fastupdate=off: eliminates the "pending list" slowdown on concurrent writes.
-- The strain table is write-rare (seeded once, updated on batch import) so
-- disabling fastupdate costs nothing and makes reads more consistent.
DROP INDEX IF EXISTS idx_strains_name_trgm;
CREATE INDEX idx_strains_name_trgm
  ON strains USING gin (name gin_trgm_ops)
  WITH (fastupdate = off);

DROP INDEX IF EXISTS idx_strains_genetics_trgm;
CREATE INDEX idx_strains_genetics_trgm
  ON strains USING gin (genetics gin_trgm_ops)
  WITH (fastupdate = off);

DROP INDEX IF EXISTS idx_strains_name_en_trgm;
CREATE INDEX idx_strains_name_en_trgm
  ON strains USING gin (name_en gin_trgm_ops)
  WITH (fastupdate = off);

-- aka[] is TEXT[] — wrap in unnest() to build a separate lookup table
-- for fuzzy aka matching without full seq scan on the aka column.
CREATE TABLE IF NOT EXISTS strain_aka_flat (
  strain_id UUID NOT NULL REFERENCES strains(id) ON DELETE CASCADE,
  alias     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_aka_flat_alias_trgm
  ON strain_aka_flat USING gin (alias gin_trgm_ops)
  WITH (fastupdate = off);

-- Populate aka flat table (idempotent)
INSERT INTO strain_aka_flat (strain_id, alias)
SELECT s.id, unnest(s.aka)
FROM   strains s
ON CONFLICT DO NOTHING;

-- Refresh GIN statistics after rebuild
ANALYZE strains;
ANALYZE strain_aka_flat;

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 4: POST-TUNING VERIFY
-- ══════════════════════════════════════════════════════════════════════════

-- Confirm indexes are being used (look for "Index Scan using idx_strains_name_trgm")
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT s.id, s.name, similarity(s.name, 'ויסטה') AS sim
FROM   strains s
WHERE  s.name % 'ויסטה'
ORDER  BY sim DESC
LIMIT  3;

-- Report current similarity threshold in effect
SHOW pg_trgm.similarity_threshold;

-- Verify index sizes
SELECT indexname, pg_size_pretty(pg_relation_size(indexname::regclass)) AS idx_size
FROM   pg_indexes
WHERE  tablename IN ('strains','strain_aka_flat')
  AND  indexname LIKE '%trgm%'
ORDER  BY indexname;
