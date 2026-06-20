-- ============================================================
--  קנאמאצ׳ — Migration V2: מודל 3-ישויות
--  genetic_identity + commercial_product + batches מורחב
--  bio_journal, checkin_log
--  בטוח להרצה חוזרת (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
-- ============================================================

-- ── genetic_identity: מקור האמת הגנטי המוחלט ──────────────────
CREATE TABLE IF NOT EXISTS genetic_identity (
  genetic_id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name              TEXT        NOT NULL,
  parents                   TEXT[]      NOT NULL DEFAULT '{}',
  aliases                   TEXT[]      NOT NULL DEFAULT '{}',
  typical_terpene_profile   JSONB       NOT NULL DEFAULT '{}'::jsonb,
  evidence_source           TEXT,
  confidence                TEXT        NOT NULL DEFAULT 'unresolved'
                            CHECK (confidence IN ('verified','probable','unresolved')),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_gen_id_display
  ON genetic_identity (lower(display_name));
CREATE INDEX IF NOT EXISTS idx_gen_id_aliases
  ON genetic_identity USING gin (aliases);
CREATE INDEX IF NOT EXISTS idx_gen_id_confidence
  ON genetic_identity (confidence);

-- ── commercial_product: מפה מותג → ישות גנטית ─────────────────
CREATE TABLE IF NOT EXISTS commercial_product (
  product_id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  producer                TEXT        NOT NULL,
  brand_label             TEXT,
  commercial_name         TEXT        NOT NULL,
  cat_no                  TEXT,
  commercial_name_norm    TEXT,                        -- צורה מנורמלת לחיפוש
  genetic_id              UUID        REFERENCES genetic_identity(genetic_id) ON DELETE SET NULL,
  genetic_certainty       TEXT        NOT NULL DEFAULT 'unknown'
                          CHECK (genetic_certainty IN ('confirmed','probable','commercial_claim','unknown')),
  price                   NUMERIC(7,2),
  pharmacy_availability   UUID[]      NOT NULL DEFAULT '{}',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cp_norm      ON commercial_product (commercial_name_norm);
CREATE INDEX IF NOT EXISTS idx_cp_genetic   ON commercial_product (genetic_id);
CREATE INDEX IF NOT EXISTS idx_cp_producer  ON commercial_product (lower(producer));
CREATE INDEX IF NOT EXISTS idx_cp_pharmacies
  ON commercial_product USING gin (pharmacy_availability);

-- ── שדות חדשים בטבלת batches ──────────────────────────────────
-- (ADD COLUMN IF NOT EXISTS — בטוח על עמודות קיימות)
DO $$ BEGIN

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='batches' AND column_name='product_id') THEN
    ALTER TABLE batches ADD COLUMN product_id UUID
      REFERENCES commercial_product(product_id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='batches' AND column_name='chemotype_class') THEN
    ALTER TABLE batches ADD COLUMN chemotype_class TEXT
      CHECK (chemotype_class IN ('THC_rich','balanced','CBD_rich'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='batches' AND column_name='category_compliance') THEN
    ALTER TABLE batches ADD COLUMN category_compliance TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='batches' AND column_name='cannabinoids_measured') THEN
    ALTER TABLE batches ADD COLUMN cannabinoids_measured JSONB;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='batches' AND column_name='cannabinoids_source') THEN
    ALTER TABLE batches ADD COLUMN cannabinoids_source TEXT NOT NULL DEFAULT 'category_only'
      CHECK (cannabinoids_source IN ('measured_full','category_only'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='batches' AND column_name='terpene_source') THEN
    ALTER TABLE batches ADD COLUMN terpene_source TEXT NOT NULL DEFAULT 'unknown'
      CHECK (terpene_source IN ('measured','typical_from_genetics','unknown'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='batches' AND column_name='humidity_lod') THEN
    ALTER TABLE batches ADD COLUMN humidity_lod NUMERIC(5,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='batches' AND column_name='consumption_type') THEN
    ALTER TABLE batches ADD COLUMN consumption_type TEXT DEFAULT 'flower'
      CHECK (consumption_type IN ('flower','oil','capsule','topical','edible'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='batches' AND column_name='batch_number') THEN
    ALTER TABLE batches ADD COLUMN batch_number TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='batches' AND column_name='batch_year') THEN
    ALTER TABLE batches ADD COLUMN batch_year SMALLINT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='batches' AND column_name='expiry') THEN
    ALTER TABLE batches ADD COLUMN expiry DATE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='batches' AND column_name='irradiation_method') THEN
    ALTER TABLE batches ADD COLUMN irradiation_method TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='batches' AND column_name='safety_panel') THEN
    ALTER TABLE batches ADD COLUMN safety_panel JSONB;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='batches' AND column_name='labs') THEN
    ALTER TABLE batches ADD COLUMN labs TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='batches' AND column_name='cert_url') THEN
    ALTER TABLE batches ADD COLUMN cert_url TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='batches' AND column_name='source_type') THEN
    ALTER TABLE batches ADD COLUMN source_type TEXT DEFAULT 'pharmacy'
      CHECK (source_type IN ('pharmacy','import','dispensary','patient_report'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='batches' AND column_name='data_confidence') THEN
    ALTER TABLE batches ADD COLUMN data_confidence NUMERIC(3,2) NOT NULL DEFAULT 0.5
      CHECK (data_confidence BETWEEN 0 AND 1);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='batches' AND column_name='provenance') THEN
    ALTER TABLE batches ADD COLUMN provenance JSONB;
  END IF;

END $$;

-- ── אינדקסים לשדות החדשים של batches ──────────────────────────
CREATE INDEX IF NOT EXISTS idx_batches_product     ON batches (product_id);
CREATE INDEX IF NOT EXISTS idx_batches_confidence  ON batches (data_confidence);
CREATE INDEX IF NOT EXISTS idx_batches_terp_source ON batches (terpene_source);

-- ── genetic_id על strains (קישור לטבלה החדשה) ──────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='strains' AND column_name='genetic_id') THEN
    ALTER TABLE strains ADD COLUMN genetic_id UUID
      REFERENCES genetic_identity(genetic_id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_strains_genetic_id ON strains (genetic_id);

-- ── bio_journal: יומן ביו-אישי מוצפן ────────────────────────────
CREATE TABLE IF NOT EXISTS bio_journal (
  id                    UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  batch_id              UUID     REFERENCES batches(id) ON DELETE SET NULL,
  strain_id             UUID     REFERENCES strains(id) ON DELETE SET NULL,
  recorded_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  dose_mg               NUMERIC(7,2),
  route                 TEXT     CHECK (route IN ('smoked','vaped','oil','edible','topical')),
  time_of_day           TEXT     CHECK (time_of_day IN ('morning','afternoon','evening','night')),
  context_tags          TEXT[]   NOT NULL DEFAULT '{}',

  pain_relief           SMALLINT CHECK (pain_relief           BETWEEN 1 AND 5),
  sleep_quality         SMALLINT CHECK (sleep_quality         BETWEEN 1 AND 5),
  mood                  SMALLINT CHECK (mood                  BETWEEN 1 AND 5),
  anxiety_level         SMALLINT CHECK (anxiety_level         BETWEEN 1 AND 5),
  functional_impairment SMALLINT CHECK (functional_impairment BETWEEN 1 AND 5),

  notes_encrypted       TEXT,
  side_effects          TEXT[]   NOT NULL DEFAULT '{}',
  onset_minutes         SMALLINT,
  duration_hours        NUMERIC(4,1)
);

CREATE INDEX IF NOT EXISTS idx_bio_journal_user
  ON bio_journal (user_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_bio_journal_strain
  ON bio_journal (strain_id);

-- ── checkin_log: לוג צ'ק-אינים יומיים ──────────────────────────
CREATE TABLE IF NOT EXISTS checkin_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dimension   TEXT        NOT NULL,
  value       TEXT        NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checkin_log_user
  ON checkin_log (user_id, recorded_at DESC);

-- ── view: genetic equivalents (כל המוצרים שחולקים genetic_id) ──
CREATE OR REPLACE VIEW genetic_equivalents AS
SELECT
  gi.genetic_id,
  gi.display_name          AS genetic_name,
  gi.confidence            AS genetic_confidence,
  cp.product_id,
  cp.producer,
  cp.brand_label,
  cp.commercial_name,
  cp.commercial_name_norm,
  cp.genetic_certainty,
  cp.price,
  cp.pharmacy_availability,
  cp.updated_at
FROM commercial_product cp
JOIN genetic_identity gi ON gi.genetic_id = cp.genetic_id
ORDER BY gi.display_name, cp.price NULLS LAST;
