import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";
import { requireManager } from "../shared/rbac";
import type { User } from "../shared/types";

interface ListUsersResponse {
  users: User[];
}

// Lists all users (manager only in production)
export const list = api(
  { auth: true, expose: true, method: "GET", path: "/users" },
  async (): Promise<ListUsersResponse> => {
    const auth = getAuthData();
    requireManager(auth?.role);
    const users: User[] = [];
    
    for await (const row of db.query<User>`
      SELECT 
        id, email, name, role,
        team_id as "teamId",
        birth_date::text as "birthDate",
        has_child as "hasChild",
        is_active as "isActive",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM users
      WHERE is_active = true
      ORDER BY name ASC
    `) {
      users.push(row);
    }
    
    return { users };
  }
);
