-- §6 pgvector: store each batch's EffectVector as a vector(7) column.
-- Axis order matches EFFECT_AXIS_KEYS:
--   [bodyCalm, clearHead, sleep, antiPain, mood, antiAnxiety, appetite]
--
-- Requires: CREATE EXTENSION IF NOT EXISTS vector; (run once per DB)

CREATE EXTENSION IF NOT EXISTS vector;

-- Add batch_effect_vec column if it doesn't exist yet
ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS batch_effect_vec vector(7);

-- IVFFlat index for fast ANN prefilter (cosine distance)
-- Tune lists to ~sqrt(row_count) for best recall/speed tradeoff.
CREATE INDEX IF NOT EXISTS batches_effect_vec_ivf
  ON batches
  USING ivfflat (batch_effect_vec vector_cosine_ops)
  WITH (lists = 100);

-- Comment for future maintainers
COMMENT ON COLUMN batches.batch_effect_vec IS
  'Normalised EffectVector(7) — axis order: bodyCalm,clearHead,sleep,antiPain,mood,antiAnxiety,appetite. '
  'Filled by the nightly backfill job (api/jobs/backfillEffectVec.js). '
  'Used for ANN prefilter: ORDER BY batch_effect_vec <=> $needVec LIMIT 200, '
  'then exact §4 blend in app code on the shortlist.';
