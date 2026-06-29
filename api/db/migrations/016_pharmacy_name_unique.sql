-- Adds a unique constraint on pharmacies.name so upserts can use ON CONFLICT.
-- Safe to run multiple times (IF NOT EXISTS guard).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pharmacies_name_unique' AND conrelid = 'pharmacies'::regclass
  ) THEN
    ALTER TABLE pharmacies ADD CONSTRAINT pharmacies_name_unique UNIQUE (name);
  END IF;
END$$;
