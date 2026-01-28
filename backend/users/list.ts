import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";
import { isAdmin, isManager, requireManager } from "../shared/rbac";
import type { User } from "../shared/types";

interface ListUsersResponse {
  users: User[];
}

// Lists all users (manager only in production)
export const list = api(
  { auth: true, expose: true, method: "GET", path: "/users" },
  async (): Promise<ListUsersResponse> => {
    const auth = getAuthData();
    const isAdminUser = isAdmin(auth?.role);
    const isManagerUser = isManager(auth?.role);
    requireManager(auth?.role);
    const users: User[] = [];
    let viewerTeamId: number | null = null;
    if (isManagerUser && !isAdminUser) {
      const viewer = await db.queryRow<{ teamId: number | null }>`
        SELECT team_id as "teamId"
        FROM users
        WHERE id = ${auth?.userID}
      `;
      viewerTeamId = viewer?.teamId ?? null;
    }
    let teamFilter = "";
    let params: Array<number> = [];
    if (isManagerUser && !isAdminUser) {
      if (viewerTeamId === null) {
        teamFilter = "AND 1=0";
      } else {
        teamFilter = "AND team_id = $1";
        params = [viewerTeamId];
      }
    }
    
    const query = `
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
      ${teamFilter}
      ORDER BY name ASC
    `;

    for await (const row of db.rawQuery<User>(query, ...params)) {
      users.push(row);
    }
    
    return { users };
  }
);
