import { api } from "encore.dev/api";
import db from "../db";
import type { Team } from "../shared/types";

interface ListTeamsResponse {
  teams: Team[];
}

// Lists all teams
export const list = api(
  { auth: true, expose: true, method: "GET", path: "/teams" },
  async (): Promise<ListTeamsResponse> => {
    const teams: Team[] = [];
    
    for await (const row of db.query<Team>`
      SELECT 
        id, name,
        max_concurrent_leaves as "maxConcurrentLeaves",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM teams
      ORDER BY name ASC
    `) {
      teams.push(row);
    }
    
    return { teams };
  }
);
