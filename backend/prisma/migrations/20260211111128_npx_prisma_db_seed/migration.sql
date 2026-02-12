/*
  Warnings:

  - The primary key for the `settings` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- AlterTable
ALTER TABLE "leave_requests" ADD COLUMN     "end_time" TIME,
ADD COLUMN     "start_time" TIME;

-- AlterTable
ALTER TABLE "settings" DROP CONSTRAINT "settings_pkey",
ALTER COLUMN "id" SET DATA TYPE INTEGER,
ALTER COLUMN "annual_leave_accrual_policy" SET DEFAULT 'YEAR_START',
ALTER COLUMN "carry_over_enabled" SET DEFAULT false,
ADD CONSTRAINT "settings_pkey" PRIMARY KEY ("id");
