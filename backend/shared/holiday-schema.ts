import db from "../db";

export async function ensureHolidayActiveColumn(): Promise<void> {
  await db.exec`
    ALTER TABLE holidays
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE
  `;
  await db.exec`
    CREATE INDEX IF NOT EXISTS idx_holidays_active ON holidays(is_active)
  `;
}
