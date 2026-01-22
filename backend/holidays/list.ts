import { api, Query } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";
import { createAuditLog } from "../shared/audit";
import { ensureHolidayActiveColumn } from "../shared/holiday-schema";
import { getSlovakHolidaySeeds } from "../shared/holiday-seeds";
import type { Holiday } from "../shared/types";

interface ListHolidaysParams {
  year?: Query<number>;
  includeInactive?: Query<boolean>;
}

interface ListHolidaysResponse {
  holidays: Holiday[];
}

// Lists all holidays, optionally filtered by year
export const list = api(
  { auth: true, expose: true, method: "GET", path: "/holidays" },
  async ({ year, includeInactive }: ListHolidaysParams): Promise<ListHolidaysResponse> => {
    const auth = getAuthData()!;
    await ensureHolidayActiveColumn();
    const shouldIncludeInactive = includeInactive === true;
    const holidays: Holiday[] = [];

    if (year) {
      const seeds = getSlovakHolidaySeeds(year);
      const existingRows = await db.queryAll<{ date: string }>`
        SELECT date::date::text as date FROM holidays
        WHERE EXTRACT(YEAR FROM date) = ${year}
      `;
      const existingDates = new Set(existingRows.map((row) => row.date));

      for (const seed of seeds) {
        if (existingDates.has(seed.date)) {
          continue;
        }
        const holiday = await db.queryRow<Holiday>`
          INSERT INTO holidays (date, name, is_company_holiday, is_active)
          VALUES (${seed.date}, ${seed.name}, ${seed.isCompanyHoliday}, ${true})
          ON CONFLICT (date) DO NOTHING
          RETURNING id, date::date::text as date, name,
            is_company_holiday as "isCompanyHoliday",
            is_active as "isActive",
            created_at as "createdAt"
        `;
        if (holiday) {
          await createAuditLog(auth.userID, "holidays", holiday.id, "CREATE", null, holiday);
        }
      }
    }

    if (year) {
      for await (const row of db.query<Holiday>`
        SELECT 
          id, date::date::text as date, name,
          is_company_holiday as "isCompanyHoliday",
          is_active as "isActive",
          created_at as "createdAt"
        FROM holidays
        WHERE EXTRACT(YEAR FROM date) = ${year}
          AND (${shouldIncludeInactive} OR is_active = true)
        ORDER BY date ASC
      `) {
        holidays.push(row);
      }
    } else {
      for await (const row of db.query<Holiday>`
        SELECT 
          id, date::date::text as date, name,
          is_company_holiday as "isCompanyHoliday",
          is_active as "isActive",
          created_at as "createdAt"
        FROM holidays
        WHERE ${shouldIncludeInactive} OR is_active = true
        ORDER BY date ASC
      `) {
        holidays.push(row);
      }
    }

    return { holidays };
  }
);
