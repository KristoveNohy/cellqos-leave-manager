ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "manual_carry_over_hours" DOUBLE PRECISION;
