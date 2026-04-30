ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "working_hours_per_day" DOUBLE PRECISION NOT NULL DEFAULT 8;

UPDATE "users"
SET "working_hours_per_day" = 8
WHERE "working_hours_per_day" IS NULL;
