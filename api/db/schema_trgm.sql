-- ──────────────────────────────────────────────────────────────
--  CannaMatch — strains table + pg_trgm fuzzy-match indexes
--  Run once after CREATE EXTENSION pg_trgm in the base schema.
--  The % operator and similarity() both use these GIN indexes.
-- ──────────────────────────────────────────────────────────────

-- Lower the match threshold so short Hebrew brand names still hit
-- (default 0.3 is too strict for 2-4 char abbreviations like "P&Z")
ALTER DATABASE cannamatch SET pg_trgm.similarity_threshold = 0.20;

-- Core strain table (idempotent — safe to re-run)
CREATE TABLE IF NOT EXISTS strains (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT        NOT NULL,           -- Hebrew commercial name (primary)
  name_en            TEXT,                           -- English / transliteration
  aka                TEXT[]      NOT NULL DEFAULT '{}',  -- extra commercial aliases
  genetics           TEXT,                           -- real genetics name (e.g. "Purple Zkittlez")
  lineage            TEXT,                           -- parentage string
  kind               TEXT        CHECK (kind IN ('indica','sativa','hybrid')),
  category           TEXT,                           -- YaKaR category e.g. "T22/C4"
  terpene_dist       JSONB,                          -- { myrcene:0.8, ... }  terp-dict format
  embedding          vector(12),                     -- 12-dim cosine embedding (THC,CBD,CBG,CBN,terps×8)
  target_indications TEXT[]      NOT NULL DEFAULT '{}',
  genetic_confidence TEXT        NOT NULL DEFAULT 'unverified'
                     CHECK (genetic_confidence IN ('verified','grower','unverified','none')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Fuzzy text indexes ────────────────────────────────────────
-- Used by: similarity(s.name, $q), s.name % $q, s.genetics % $q
CREATE INDEX IF NOT EXISTS idx_strains_name_trgm
  ON strains USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_strains_genetics_trgm
  ON strains USING gin (genetics gin_trgm_ops);

-- name_en is often used in menu scans that mix Hebrew/English
CREATE INDEX IF NOT EXISTS idx_strains_name_en_trgm
  ON strains USING gin (name_en gin_trgm_ops);

-- Indication filter (used in checkin safe-target query)
CREATE INDEX IF NOT EXISTS idx_strains_indications
  ON strains USING gin (target_indications);

-- ── Helper: rank a list of commercial names by trigram similarity
--    Call this from application code when you need the top match
--    for each scanned menu item without a round-trip per name.
--
--    Usage:
--      SELECT * FROM strain_fuzzy_match(ARRAY['P&Z','ארתור','Wedding CK'], 0.20);
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION strain_fuzzy_match(
  names        TEXT[],
  min_sim      FLOAT DEFAULT 0.20
)
RETURNS TABLE (
  commercial   TEXT,
  strain_id    UUID,
  strain_name  TEXT,
  genetics     TEXT,
  lineage      TEXT,
  kind         TEXT,
  category     TEXT,
  terpene_dist JSONB,
  target_indications TEXT[],
  sim_score    FLOAT
) LANGUAGE sql STABLE AS $$
  SELECT DISTINCT ON (n.name)
    n.name                       AS commercial,
    s.id                         AS strain_id,
    s.name                       AS strain_name,
    s.genetics,
    s.lineage,
    s.kind,
    b.category,
    s.terpene_dist,
    s.target_indications,
    GREATEST(
      similarity(s.name,              n.name),
      similarity(COALESCE(s.genetics, ''), n.name),
      similarity(COALESCE(s.name_en,  ''), n.name)
    ) AS sim_score
  FROM unnest(names) AS n(name)
  JOIN strains s ON (
    s.name     % n.name OR
    s.genetics % n.name OR
    s.name_en  % n.name OR
    n.name = ANY(s.aka)
  )
  LEFT JOIN LATERAL (
    SELECT category FROM batches
    WHERE strain_id = s.id AND in_stock = TRUE
    ORDER BY price ASC LIMIT 1
  ) b ON TRUE
  WHERE GREATEST(
    similarity(s.name,              n.name),
    similarity(COALESCE(s.genetics, ''), n.name)
  ) >= min_sim
  ORDER BY n.name, sim_score DESC
$$;
