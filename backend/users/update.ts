import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";
import { validateEmail } from "../shared/validation";
import { createAuditLog } from "../shared/audit";
import { requireManager } from "../shared/rbac";
import type { User, UserRole } from "../shared/types";

interface UpdateUserParams {
  id: string;
  email?: string;
  name?: string;
  role?: UserRole;
  teamId?: number;
}

export const update = api<UpdateUserParams, User>(
  { auth: true, expose: true, method: "PATCH", path: "/users/:id" },
  async (req): Promise<User> => {
    const { id, email, name, role, teamId } = req;
    const auth = getAuthData()!;
    requireManager(auth.role);
    const before = await db.queryRow`
      SELECT * FROM users WHERE id = ${id}
    `;
    
    if (!before) {
      throw APIError.notFound("User not found");
    }
    
    if (email) {
      validateEmail(email);
    }
    
    const updates: string[] = [];
    const values: any[] = [];
    
    if (email !== undefined) {
      updates.push(`email = $${values.length + 1}`);
      values.push(email);
    }
    if (name !== undefined) {
      updates.push(`name = $${values.length + 1}`);
      values.push(name);
    }
    if (role !== undefined) {
      updates.push(`role = $${values.length + 1}`);
      values.push(role);
    }
    if (teamId !== undefined) {
      updates.push(`team_id = $${values.length + 1}`);
      values.push(teamId || null);
    }
    
    if (updates.length > 0) {
      values.push(id);
      await db.rawExec(
        `UPDATE users SET ${updates.join(", ")} WHERE id = $${values.length}`,
        ...values
      );
    }
    
    const user = await db.queryRow<User>`
      SELECT 
        id, email, name, role,
        team_id as "teamId",
        is_active as "isActive",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM users
      WHERE id = ${id}
    `;
    
    await createAuditLog(
      auth.userID,
      "users",
      id,
      "UPDATE",
      before,
      user
    );
    
    return user!;
  }
);
