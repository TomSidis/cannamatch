-- Migration 018: B1 schema foundations
--
-- "strain_catalog" in the spec = genetics_node in this codebase.
--
-- 1. genetics_node       — chemotype enum (I–V), parent_a, parent_b
-- 2. product_sku         — terpene_source
-- 3. grow_batch          — terpene_source
-- 4. treatment_journal   — severity_before, severity_after, delta (generated),
--                          indication, time_of_day, product_sku_id, batch_id
--
-- Chemotype key:
--   I   = THC-dominant   (>20% THC, <1% CBD)
--   II  = Balanced       (~1:1 THC:CBD)
--   III = CBD-dominant   (<1% THC, >10% CBD)
--   IV  = CBG-dominant   (high CBG regardless of THC/CBD)
--   V   = None / trace   (total cannabinoids <0.3%)
--
-- RULE: chemotype is metadata only — it MUST NOT feed scoring.
-- RULE: legacy indica/sativa stays as text; MUST NOT feed scoring.
--
-- Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

-- ── 1. genetics_node — chemotype + denormalized parent slots ─────────────────
--
-- parent_a / parent_b: denormalized shortcuts; lineage_edge (h0) is canonical.
-- Use these for quick display; use lineage_edge for graph traversal.

ALTER TABLE genetics_node
  ADD COLUMN IF NOT EXISTS chemotype TEXT
    CHECK (chemotype IN ('I', 'II', 'III', 'IV', 'V')),
  ADD COLUMN IF NOT EXISTS parent_a  TEXT REFERENCES genetics_node(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_b  TEXT REFERENCES genetics_node(id) ON DELETE SET NULL;

COMMENT ON COLUMN genetics_node.chemotype IS
  'I=THC-dom II=balanced III=CBD-dom IV=CBG-dom V=trace. Display only — NEVER feed scoring.';
COMMENT ON COLUMN genetics_node.parent_a IS
  'Denormalized primary parent ref. lineage_edge h0 is canonical for graph work.';
COMMENT ON COLUMN genetics_node.parent_b IS
  'Denormalized secondary parent ref. lineage_edge h0 is canonical for graph work.';

CREATE INDEX IF NOT EXISTS idx_gen_node_chemotype ON genetics_node (chemotype);
CREATE INDEX IF NOT EXISTS idx_gen_node_parent_a  ON genetics_node (parent_a);
CREATE INDEX IF NOT EXISTS idx_gen_node_parent_b  ON genetics_node (parent_b);

-- ── 2. product_sku — terpene_source ──────────────────────────────────────────
--
-- How the dominant terpene order in terpene_rank[] was determined.
-- Default 'declared_rank': Israeli manufacturer declares an ordered list, no %.

ALTER TABLE product_sku
  ADD COLUMN IF NOT EXISTS terpene_source TEXT NOT NULL DEFAULT 'declared_rank'
    CHECK (terpene_source IN ('measured', 'declared_rank', 'community_inferred'));

-- ── 3. grow_batch — terpene_source ───────────────────────────────────────────
--
-- Separate from provenance (COA-level); this covers terpene data specifically.

ALTER TABLE grow_batch
  ADD COLUMN IF NOT EXISTS terpene_source TEXT NOT NULL DEFAULT 'declared_rank'
    CHECK (terpene_source IN ('measured', 'declared_rank', 'community_inferred'));

-- ── 4. treatment_journal — pre/post severity + session metadata ───────────────
--
-- severity_before / severity_after: 0–10 (0=no symptom, 10=worst).
-- delta: GENERATED ALWAYS AS (severity_after - severity_before) STORED.
--   Positive = worsening, negative = improvement. NULL when either severity is NULL.
-- indication: what the user was treating (slug matching REASONS ids, e.g. 'sleep').
-- time_of_day: session time bucket.
-- product_sku_id: links to the specific commercial product (product_sku.id).
-- batch_id: soft TEXT reference to grow_batch.id (NULL if batch unknown to user).
--
-- All new columns nullable — existing rows must not be invalidated.

ALTER TABLE treatment_journal
  ADD COLUMN IF NOT EXISTS severity_before SMALLINT
    CHECK (severity_before  BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS severity_after  SMALLINT
    CHECK (severity_after   BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS indication      TEXT,
  ADD COLUMN IF NOT EXISTS time_of_day     TEXT
    CHECK (time_of_day IN ('morning', 'afternoon', 'evening', 'night')),
  ADD COLUMN IF NOT EXISTS product_sku_id  UUID REFERENCES product_sku(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS batch_id        TEXT;

-- delta as a GENERATED ALWAYS AS column (PostgreSQL 12+).
-- Cannot use ADD COLUMN IF NOT EXISTS syntax for generated columns,
-- so we guard with a DO block.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name  = 'treatment_journal'
       AND column_name = 'delta'
  ) THEN
    EXECUTE '
      ALTER TABLE treatment_journal
        ADD COLUMN delta SMALLINT
          GENERATED ALWAYS AS (severity_after - severity_before) STORED
    ';
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_tj_indication  ON treatment_journal (indication);
CREATE INDEX IF NOT EXISTS idx_tj_time_of_day ON treatment_journal (time_of_day);
CREATE INDEX IF NOT EXISTS idx_tj_sku         ON treatment_journal (product_sku_id);
