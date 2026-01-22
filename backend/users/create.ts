import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";
import { validateEmail } from "../shared/validation";
import { createAuditLog } from "../shared/audit";
import { requireManager } from "../shared/rbac";
import type { User, UserRole } from "../shared/types";

interface CreateUserRequest {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  teamId?: number;
  birthDate?: string | null;
  hasChild?: boolean;
}

// Creates a new user (manager only)
export const create = api(
  { auth: true, expose: true, method: "POST", path: "/users" },
  async (req: CreateUserRequest): Promise<User> => {
    const auth = getAuthData()!;
    requireManager(auth.role);
    validateEmail(req.email);
    
    await db.exec`
      INSERT INTO users (id, email, name, role, team_id, birth_date, has_child)
      VALUES (
        ${req.id},
        ${req.email},
        ${req.name},
        ${req.role},
        ${req.teamId || null},
        ${req.birthDate || null},
        ${req.hasChild ?? false}
      )
    `;
    
    const user = await db.queryRow<User>`
      SELECT 
        id, email, name, role,
        team_id as "teamId",
        birth_date::text as "birthDate",
        has_child as "hasChild",
        is_active as "isActive",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM users
      WHERE id = ${req.id}
    `;
    
    await createAuditLog(
      auth.userID,
      "users",
      req.id,
      "CREATE",
      null,
      user
    );
    
    return user!;
  }
);
