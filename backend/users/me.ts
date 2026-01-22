import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";
import type { User } from "../shared/types";

export const me = api(
  { auth: true, expose: true, method: "GET", path: "/users/me" },
  async (): Promise<User> => {
    const auth = getAuthData()!;
    
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
      WHERE id = ${auth.userID}
    `;
    
    if (!user) {
      throw new Error("User not found");
    }
    
    return user;
  }
);
