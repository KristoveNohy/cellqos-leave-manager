ALTER TABLE "leave_requests"
  DROP COLUMN IF EXISTS "is_half_day_start",
  DROP COLUMN IF EXISTS "is_half_day_end";
