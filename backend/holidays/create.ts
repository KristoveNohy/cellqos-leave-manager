import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";
import { parseDate } from "../shared/date-utils";
import { createAuditLog } from "../shared/audit";
import { ensureHolidayActiveColumn } from "../shared/holiday-schema";
import { requireManager } from "../shared/rbac";
import type { Holiday } from "../shared/types";

interface CreateHolidayRequest {
  date: string;
  name: string;
  isCompanyHoliday?: boolean;
  isActive?: boolean;
}

// Creates a new holiday (manager only)
export const create = api(
  { auth: true, expose: true, method: "POST", path: "/holidays" },
  async (req: CreateHolidayRequest): Promise<Holiday> => {
    const auth = getAuthData()!;
    requireManager(auth.role);
    await ensureHolidayActiveColumn();
    parseDate(req.date);

    if (req.isActive !== undefined && typeof req.isActive !== "boolean") {
      throw APIError.invalidArgument("isActive must be a boolean");
    }
    
    try {
      const result = await db.queryRow<{ id: number }>`
        INSERT INTO holidays (date, name, is_company_holiday, is_active)
        VALUES (
          ${req.date},
          ${req.name},
          ${req.isCompanyHoliday ?? true},
          ${req.isActive ?? true}
        )
        RETURNING id
      `;
      
      const holiday = await db.queryRow<Holiday>`
        SELECT 
          id, date::text as date, name,
          is_company_holiday as "isCompanyHoliday",
          is_active as "isActive",
          created_at as "createdAt"
        FROM holidays
        WHERE id = ${result!.id}
      `;
      
      await createAuditLog(
        auth.userID,
        "holidays",
        holiday!.id,
        "CREATE",
        null,
        holiday
      );
      
      return holiday!;
    } catch (error: any) {
      if (error.message?.includes("duplicate key")) {
        throw APIError.alreadyExists("Holiday for this date already exists");
      }
      throw error;
    }
  }
);
