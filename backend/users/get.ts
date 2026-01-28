import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";
import { isAdmin, isManager, requireAdmin } from "../shared/rbac";
import type { User } from "../shared/types";

interface GetUserParams {
  id: string;
}

// Gets a specific user by ID
export const get = api(
  { auth: true, expose: true, method: "GET", path: "/users/:id" },
  async ({ id }: GetUserParams): Promise<User> => {
    const auth = getAuthData()!;
    if (auth.userID !== id) {
      if (isAdmin(auth.role)) {
        // ok
      } else if (isManager(auth.role)) {
        const viewer = await db.queryRow<{ teamId: number | null }>`
          SELECT team_id as "teamId"
          FROM users
          WHERE id = ${auth.userID}
        `;
        const target = await db.queryRow<{ teamId: number | null }>`
          SELECT team_id as "teamId"
          FROM users
          WHERE id = ${id}
        `;
        if (!viewer || !target || viewer.teamId === null || viewer.teamId !== target.teamId) {
          requireAdmin(auth.role);
        }
      } else {
        requireAdmin(auth.role);
      }
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
    
    if (!user) {
      throw APIError.notFound("User not found");
    }
    
    return user;
  }
);
