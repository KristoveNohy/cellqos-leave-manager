import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";
import { createAuditLog } from "../shared/audit";
import { requireManager } from "../shared/rbac";

interface DeleteHolidayParams {
  id: number;
}

// Deletes a holiday (manager only)
export const remove = api(
  { auth: true, expose: true, method: "DELETE", path: "/holidays/:id" },
  async ({ id }: DeleteHolidayParams): Promise<void> => {
    const auth = getAuthData()!;
    requireManager(auth.role);
    const before = await db.queryRow`
      SELECT * FROM holidays WHERE id = ${id}
    `;
    
    if (!before) {
      throw APIError.notFound("Holiday not found");
    }
    
    await db.exec`DELETE FROM holidays WHERE id = ${id}`;
    
    await createAuditLog(
      auth.userID,
      "holidays",
      id,
      "DELETE",
      before,
      null
    );
  }
);
