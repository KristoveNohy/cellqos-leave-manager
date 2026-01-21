import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";
import { createAuditLog } from "../shared/audit";
import type { Team } from "../shared/types";

interface UpdateTeamParams {
  id: number;
  name?: string;
  maxConcurrentLeaves?: number;
}

export const update = api<UpdateTeamParams, Team>(
  { auth: true, expose: true, method: "PATCH", path: "/teams/:id" },
  async (req): Promise<Team> => {
    const { id, name, maxConcurrentLeaves } = req;
    const auth = getAuthData()!;
    const before = await db.queryRow`
      SELECT * FROM teams WHERE id = ${id}
    `;
    
    if (!before) {
      throw APIError.notFound("Team not found");
    }
    
    const updates: string[] = [];
    const values: any[] = [];
    
    if (name !== undefined) {
      updates.push(`name = $${values.length + 1}`);
      values.push(name);
    }
    if (maxConcurrentLeaves !== undefined) {
      updates.push(`max_concurrent_leaves = $${values.length + 1}`);
      values.push(maxConcurrentLeaves || null);
    }
    
    if (updates.length > 0) {
      values.push(id);
      await db.rawExec(
        `UPDATE teams SET ${updates.join(", ")} WHERE id = $${values.length}`,
        ...values
      );
    }
    
    const team = await db.queryRow<Team>`
      SELECT 
        id, name,
        max_concurrent_leaves as "maxConcurrentLeaves",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM teams
      WHERE id = ${id}
    `;
    
    await createAuditLog(
      auth.userID,
      "teams",
      id,
      "UPDATE",
      before,
      team
    );
    
    return team!;
  }
);
