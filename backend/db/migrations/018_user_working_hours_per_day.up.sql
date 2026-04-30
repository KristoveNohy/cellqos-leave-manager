ALTER TABLE users
  ADD COLUMN IF NOT EXISTS working_hours_per_day DOUBLE PRECISION NOT NULL DEFAULT 8;

UPDATE users
SET working_hours_per_day = 8
WHERE working_hours_per_day IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_working_hours_per_day_positive'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_working_hours_per_day_positive
      CHECK (working_hours_per_day > 0);
  END IF;
END $$;
