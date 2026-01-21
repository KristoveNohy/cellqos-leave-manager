import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";
import { validateEmail } from "../shared/validation";
import { createAuditLog } from "../shared/audit";
import type { User, UserRole } from "../shared/types";

interface CreateUserRequest {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  teamId?: number;
}

// Creates a new user (manager only)
export const create = api(
  { auth: true, expose: true, method: "POST", path: "/users" },
  async (req: CreateUserRequest): Promise<User> => {
    const auth = getAuthData()!;
    validateEmail(req.email);
    
    await db.exec`
      INSERT INTO users (id, email, name, role, team_id)
      VALUES (
        ${req.id},
        ${req.email},
        ${req.name},
        ${req.role},
        ${req.teamId || null}
      )
    `;
    
    const user = await db.queryRow<User>`
      SELECT 
        id, email, name, role,
        team_id as "teamId",
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
