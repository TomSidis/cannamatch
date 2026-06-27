-- Migration 006: Master Genetics Map
-- genetics_node, lineage_edge, cultivation_modifier
-- Extends commercial_product with genetics fields.
-- Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

-- ── genetics_node ──────────────────────────────────────────────────────────────
-- Each row is a unique genetic identity (cross, pheno, or landrace).
-- identity = genetics, not cultivator: D51(Seach) and Solo AKA(Solo) are ONE node.
CREATE TABLE IF NOT EXISTS genetics_node (
  id           TEXT PRIMARY KEY,                  -- kebab-case slug
  display_name TEXT NOT NULL UNIQUE,
  aliases      TEXT[] NOT NULL DEFAULT '{}',      -- alternative names, commercial names, codes
  node_type    TEXT NOT NULL DEFAULT 'hybrid'
               CHECK (node_type IN ('landrace', 'hybrid', 'phenotype', 'backcross')),
  -- Partial effect vector (7-axis, same as EffectVector in TypeScript).
  -- NULL = unknown; populated by expert seed or derived by derivePhenoPrior.
  effect_vec   JSONB,
  prior_source TEXT NOT NULL DEFAULT 'placeholder'
               CHECK (prior_source IN ('measured', 'derived', 'expert', 'placeholder')),
  prior_conf   NUMERIC(3,2) NOT NULL DEFAULT 0.0
               CHECK (prior_conf BETWEEN 0 AND 1),
  top_terpenes TEXT[] NOT NULL DEFAULT '{}',
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gen_node_aliases ON genetics_node USING gin (aliases);
CREATE INDEX IF NOT EXISTS idx_gen_node_type    ON genetics_node (node_type);

-- ── lineage_edge ───────────────────────────────────────────────────────────────
-- Parent→child relationship. hypothesis_id allows competing parentage claims.
-- h0 = primary/most-cited; h1, h2 = competing claims.
-- derivePhenoPrior always uses h0 only.
CREATE TABLE IF NOT EXISTS lineage_edge (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id      TEXT NOT NULL REFERENCES genetics_node(id) ON DELETE CASCADE,
  parent_id     TEXT NOT NULL REFERENCES genetics_node(id) ON DELETE RESTRICT,
  hypothesis_id SMALLINT NOT NULL DEFAULT 0,     -- 0=primary, 1+=competing claim
  parent_weight NUMERIC(4,3) NOT NULL DEFAULT 0.5
                CHECK (parent_weight BETWEEN 0 AND 1),
  edge_conf     NUMERIC(3,2) NOT NULL DEFAULT 0.8
                CHECK (edge_conf BETWEEN 0 AND 1),
  source        TEXT,                             -- citation or provenance note
  UNIQUE (child_id, parent_id, hypothesis_id)
);

CREATE INDEX IF NOT EXISTS idx_lineage_child  ON lineage_edge (child_id, hypothesis_id);
CREATE INDEX IF NOT EXISTS idx_lineage_parent ON lineage_edge (parent_id);

-- ── cultivation_modifier ───────────────────────────────────────────────────────
-- Terpene quantity scale by grow method. COUNTERINTUITIVE per Israeli agronomy:
-- greenhouse (full-sun broad spectrum) → richer than indoor LED.
-- Applies to QUANTITY only, not relative profile. Measured batch always overrides.
CREATE TABLE IF NOT EXISTS cultivation_modifier (
  method        TEXT PRIMARY KEY
                CHECK (method IN ('indoor', 'outdoor', 'greenhouse', 'hybrid_grow')),
  terpene_scale NUMERIC(4,3) NOT NULL,
  notes         TEXT
);

INSERT INTO cultivation_modifier (method, terpene_scale, notes) VALUES
  ('greenhouse',  1.10, 'Full-sun broad spectrum → richer terpene expression'),
  ('indoor',      0.95, 'LED narrow spectrum → slightly lower terpene quantity'),
  ('outdoor',     1.05, 'Natural full-sun → moderate enrichment'),
  ('hybrid_grow', 1.05, 'Mixed; tends toward greenhouse quality')
ON CONFLICT (method) DO UPDATE
  SET terpene_scale = EXCLUDED.terpene_scale,
      notes         = EXCLUDED.notes;

-- ── Extend commercial_product with genetics fields ─────────────────────────────
-- genetics_node_id: links this commercial product to its canonical genetic identity
-- cultivator: metadata only (does NOT affect prior; affects batch UX labeling)
-- cultivation_method: used by cultivation_modifier for tie-breaking between SKUs
-- map_conf: overall confidence in the genetics → product mapping
ALTER TABLE commercial_product
  ADD COLUMN IF NOT EXISTS genetics_node_id  TEXT REFERENCES genetics_node(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cultivator        TEXT,
  ADD COLUMN IF NOT EXISTS cultivation_method TEXT
    CHECK (cultivation_method IN ('indoor', 'outdoor', 'greenhouse', 'hybrid_grow')),
  ADD COLUMN IF NOT EXISTS map_conf          NUMERIC(3,2) NOT NULL DEFAULT 0.0
    CHECK (map_conf BETWEEN 0 AND 1);

CREATE INDEX IF NOT EXISTS idx_cp_gen_node ON commercial_product (genetics_node_id);
