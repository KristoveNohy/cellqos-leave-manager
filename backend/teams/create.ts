import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";
import { createAuditLog } from "../shared/audit";
import type { Team } from "../shared/types";

interface CreateTeamRequest {
  name: string;
  maxConcurrentLeaves?: number;
}

// Creates a new team (manager only)
export const create = api(
  { auth: true, expose: true, method: "POST", path: "/teams" },
  async (req: CreateTeamRequest): Promise<Team> => {
    const auth = getAuthData()!;
    const result = await db.queryRow<{ id: number }>`
      INSERT INTO teams (name, max_concurrent_leaves)
      VALUES (${req.name}, ${req.maxConcurrentLeaves || null})
      RETURNING id
    `;
    
    const team = await db.queryRow<Team>`
      SELECT 
        id, name,
        max_concurrent_leaves as "maxConcurrentLeaves",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM teams
      WHERE id = ${result!.id}
    `;
    
    await createAuditLog(
      auth.userID,
      "teams",
      team!.id,
      "CREATE",
      null,
      team
    );
    
    return team!;
  }
);
