import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";
import { createAuditLog } from "../shared/audit";
import { requireAdmin } from "../shared/rbac";

interface DeactivateUserParams {
  id: string;
}

// Deactivates a user (soft delete, admin only)
export const deactivate = api(
  { auth: true, expose: true, method: "DELETE", path: "/users/:id" },
  async ({ id }: DeactivateUserParams): Promise<void> => {
    const auth = getAuthData()!;
    requireAdmin(auth.role);
    const before = await db.queryRow`
      SELECT * FROM users WHERE id = ${id}
    `;
    
    if (!before) {
      throw APIError.notFound("User not found");
    }
    
    await db.exec`
      UPDATE users SET is_active = false WHERE id = ${id}
    `;
    
    await createAuditLog(
      auth.userID,
      "users",
      id,
      "DEACTIVATE",
      before,
      { ...before, is_active: false }
    );
  }
);
