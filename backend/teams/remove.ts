import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";
import { createAuditLog } from "../shared/audit";

interface DeleteTeamParams {
  id: number;
}

// Deletes a team (manager only)
export const remove = api(
  { auth: true, expose: true, method: "DELETE", path: "/teams/:id" },
  async ({ id }: DeleteTeamParams): Promise<void> => {
    const auth = getAuthData()!;
    const before = await db.queryRow`
      SELECT * FROM teams WHERE id = ${id}
    `;
    
    if (!before) {
      throw APIError.notFound("Team not found");
    }
    
    // Check if team has users
    const userCount = await db.queryRow<{ count: number }>`
      SELECT COUNT(*) as count FROM users WHERE team_id = ${id}
    `;
    
    if (userCount && userCount.count > 0) {
      throw APIError.failedPrecondition(
        "Cannot delete team with active users. Reassign users first."
      );
    }
    
    await db.exec`DELETE FROM teams WHERE id = ${id}`;
    
    await createAuditLog(
      auth.userID,
      "teams",
      id,
      "DELETE",
      before,
      null
    );
  }
);
