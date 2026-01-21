import { api, APIError } from "encore.dev/api";
import db from "../db";
import type { Team } from "../shared/types";

interface GetTeamParams {
  id: number;
}

// Gets a specific team by ID
export const get = api(
  { auth: true, expose: true, method: "GET", path: "/teams/:id" },
  async ({ id }: GetTeamParams): Promise<Team> => {
    const team = await db.queryRow<Team>`
      SELECT 
        id, name,
        max_concurrent_leaves as "maxConcurrentLeaves",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM teams
      WHERE id = ${id}
    `;
    
    if (!team) {
      throw APIError.notFound("Team not found");
    }
    
    return team;
  }
);
