import { api, Query } from "encore.dev/api";
import db from "../db";
import type { Holiday } from "../shared/types";

interface ListHolidaysParams {
  year?: Query<number>;
}

interface ListHolidaysResponse {
  holidays: Holiday[];
}

// Lists all holidays, optionally filtered by year
export const list = api(
  { auth: true, expose: true, method: "GET", path: "/holidays" },
  async ({ year }: ListHolidaysParams): Promise<ListHolidaysResponse> => {
    const holidays: Holiday[] = [];
    
    if (year) {
      for await (const row of db.query<Holiday>`
        SELECT 
          id, date::text as date, name,
          is_company_holiday as "isCompanyHoliday",
          created_at as "createdAt"
        FROM holidays
        WHERE EXTRACT(YEAR FROM date) = ${year}
        ORDER BY date ASC
      `) {
        holidays.push(row);
      }
    } else {
      for await (const row of db.query<Holiday>`
        SELECT 
          id, date::text as date, name,
          is_company_holiday as "isCompanyHoliday",
          created_at as "createdAt"
        FROM holidays
        ORDER BY date ASC
      `) {
        holidays.push(row);
      }
    }
    
    return { holidays };
  }
);
