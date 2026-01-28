import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";
import { createAuditLog } from "../shared/audit";
import { isAdmin, isManager } from "../shared/rbac";

interface DeleteLeaveRequestParams {
  id: number;
}

// Deletes a leave request (manager only)
export const remove = api(
  { auth: true, expose: true, method: "DELETE", path: "/leave-requests/:id" },
  async ({ id }: DeleteLeaveRequestParams): Promise<void> => {
    const auth = getAuthData()!;
    const isAdminUser = isAdmin(auth.role);
    const isManagerUser = isManager(auth.role);
    if (!isManagerUser && !isAdminUser) {
      throw APIError.permissionDenied("Employees cannot delete requests; use cancel.");
    }
    const request = await db.queryRow<any>`
      SELECT lr.*, lr.user_id as "userId", u.team_id as "teamId"
      FROM leave_requests lr
      JOIN users u ON lr.user_id = u.id
      WHERE lr.id = ${id}
    `;
    
    if (!request) {
      throw APIError.notFound("Leave request not found");
    }

    if (isManagerUser && !isAdminUser && request.userId !== auth.userID) {
      const viewer = await db.queryRow<{ teamId: number | null }>`
        SELECT team_id as "teamId"
        FROM users
        WHERE id = ${auth.userID}
      `;
      if (!viewer || viewer.teamId === null || viewer.teamId !== request.teamId) {
        throw APIError.permissionDenied("Cannot delete another team's request");
      }
    }
    
    const actorId = auth.userID;
    
    await db.exec`DELETE FROM leave_requests WHERE id = ${id}`;
    
    await createAuditLog(
      actorId,
      "leave_request",
      id,
      "DELETE",
      request,
      null
    );
  }
);
