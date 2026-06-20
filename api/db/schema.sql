-- ============================================================
--  קנאמאצ׳ — סכמת Node backend (api/)
--  תואמת ל-routes ב-server.js: strains, batches, users,
--  user_dna_profiles, user_reviews
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS users (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pseudonym          TEXT,
  email              TEXT UNIQUE,
  phone              TEXT UNIQUE,
  license_categories TEXT[] NOT NULL DEFAULT '{}',
  thc_tolerance      TEXT NOT NULL DEFAULT 'new'
                     CHECK (thc_tolerance IN ('new','medium','veteran')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact      TEXT NOT NULL,                  -- email or phone, lowercase/normalized
  channel      TEXT NOT NULL CHECK (channel IN ('email','sms')),
  code_hash    TEXT NOT NULL,
  attempts     SMALLINT NOT NULL DEFAULT 0,
  consumed     BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_otp_contact ON otp_codes(contact, created_at DESC);

CREATE TABLE IF NOT EXISTS user_dna_profiles (
  user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  profile     JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS strains (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT NOT NULL,
  name_en            TEXT,
  aka                TEXT[] NOT NULL DEFAULT '{}',
  genetics           TEXT,
  lineage            TEXT,
  kind               TEXT CHECK (kind IN ('indica','sativa','hybrid')),
  category           TEXT,
  terpene_dist       JSONB,
  embedding          vector(12),
  target_indications TEXT[] NOT NULL DEFAULT '{}',
  genetic_confidence TEXT NOT NULL DEFAULT 'unverified'
                     CHECK (genetic_confidence IN ('verified','grower','unverified','none')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pharmacies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  city            TEXT,
  delivery        BOOLEAN NOT NULL DEFAULT FALSE,
  address         TEXT,
  phone           TEXT,
  website_url     TEXT,
  maps_url        TEXT,
  hours_weekdays  TEXT,                            -- e.g. "09:00-20:00" (Sun-Thu)
  hours_friday    TEXT,
  hours_saturday  TEXT
);

CREATE TABLE IF NOT EXISTS batches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strain_id   UUID NOT NULL REFERENCES strains(id) ON DELETE CASCADE,
  pharmacy_id UUID REFERENCES pharmacies(id) ON DELETE SET NULL,
  batch_lot   TEXT,
  embedding   vector(12),
  category    TEXT,
  product_type TEXT DEFAULT 'flower' CHECK (product_type IN ('flower','oil','rolls')),
  price       NUMERIC(7,2),
  in_stock    BOOLEAN NOT NULL DEFAULT TRUE,
  confidence_score NUMERIC(5,4) NOT NULL DEFAULT 0.5,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- מחליפה בהדרגה את batches כקישור בית מרקחת <-> זן
CREATE TABLE IF NOT EXISTS pharmacy_inventories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  strain_id   UUID NOT NULL REFERENCES strains(id) ON DELETE CASCADE,
  price       NUMERIC(7,2),
  in_stock    BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pharmacy_id, strain_id)
);

CREATE TABLE IF NOT EXISTS user_reviews (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  strain_id         UUID NOT NULL REFERENCES strains(id) ON DELETE CASCADE,
  efficacy          SMALLINT CHECK (efficacy BETWEEN 1 AND 5),
  anxiety_triggered BOOLEAN NOT NULL DEFAULT FALSE,
  pain_relief       SMALLINT CHECK (pain_relief BETWEEN 1 AND 5),
  sleep_quality     SMALLINT CHECK (sleep_quality BETWEEN 1 AND 5),
  side_effects      TEXT[] NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- אינדקסים לחיפוש גנטי מהיר + וקטורי
CREATE INDEX IF NOT EXISTS idx_strains_name_trgm     ON strains USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_strains_genetics_trgm ON strains USING gin (genetics gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_strains_indications   ON strains USING gin (target_indications);
CREATE INDEX IF NOT EXISTS idx_batches_embedding_hnsw
  ON batches USING hnsw (embedding vector_cosine_ops) WITH (m=16, ef_construction=64);
CREATE INDEX IF NOT EXISTS idx_reviews_user   ON user_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_strain ON user_reviews(strain_id);
CREATE INDEX IF NOT EXISTS idx_pharm_inv_pharmacy ON pharmacy_inventories(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_pharm_inv_strain   ON pharmacy_inventories(strain_id);
