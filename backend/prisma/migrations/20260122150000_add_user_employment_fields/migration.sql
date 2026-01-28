-- Add missing user employment fields introduced in schema.prisma
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "employment_start_date" DATE,
  ADD COLUMN IF NOT EXISTS "manual_leave_allowance_days" DOUBLE PRECISION;
