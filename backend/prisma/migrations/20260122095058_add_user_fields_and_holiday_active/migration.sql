/*
  Warnings:

  - A unique constraint covering the columns `[dedupe_key]` on the table `notifications` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "holidays" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "dedupe_key" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "birth_date" DATE,
ADD COLUMN     "has_child" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");
