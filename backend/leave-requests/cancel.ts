import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";
import { createAuditLog, createNotification } from "../shared/audit";
import { isAdmin, isManager } from "../shared/rbac";
import type { LeaveRequest } from "../shared/types";

interface CancelLeaveRequestParams {
  id: number;
}

// Cancels a leave request
export const cancel = api(
  { auth: true, expose: true, method: "POST", path: "/leave-requests/:id/cancel" },
  async ({ id }: CancelLeaveRequestParams): Promise<LeaveRequest> => {
    const auth = getAuthData()!;
    const isAdminUser = isAdmin(auth.role);
    const isManagerUser = isManager(auth.role);
    const request = await db.queryRow<LeaveRequest>`
      SELECT 
        id, user_id as "userId", type,
        start_date::date::text as "startDate",
        end_date::date::text as "endDate",
        start_time::text as "startTime",
        end_time::text as "endTime",
        
        
        status, reason, manager_comment as "managerComment",
        approved_by as "approvedBy",
        approved_at as "approvedAt",
        computed_hours as "computedHours",
        attachment_url as "attachmentUrl",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM leave_requests
      WHERE id = ${id}
    `;
    
    if (!request) {
      throw APIError.notFound("Leave request not found");
    }
    
    if (request.status === "CANCELLED") {
      throw APIError.failedPrecondition("Request is already cancelled");
    }

    if (!isManagerUser && !isAdminUser && request.userId !== auth.userID) {
      throw APIError.permissionDenied("Cannot cancel another user's request");
    }

    const requester = await db.queryRow<{ teamId: number | null; name: string }>`
      SELECT team_id as "teamId", name
      FROM users
      WHERE id = ${request.userId}
    `;

    if (isManagerUser && !isAdminUser && request.userId !== auth.userID) {
      const viewer = await db.queryRow<{ teamId: number | null }>`
        SELECT team_id as "teamId"
        FROM users
        WHERE id = ${auth.userID}
      `;
      if (!viewer || viewer.teamId === null || viewer.teamId !== requester?.teamId) {
        throw APIError.permissionDenied("Cannot cancel another team's request");
      }
    }

    const actorId = auth.userID;
    
    await db.exec`
      UPDATE leave_requests
      SET status = 'CANCELLED'
      WHERE id = ${id}
    `;
    
    const updated = await db.queryRow<LeaveRequest>`
      SELECT 
        id, user_id as "userId", type,
        start_date::date::text as "startDate",
        end_date::date::text as "endDate",
        start_time::text as "startTime",
        end_time::text as "endTime",
        
        
        status, reason, manager_comment as "managerComment",
        approved_by as "approvedBy",
        approved_at as "approvedAt",
        computed_hours as "computedHours",
        attachment_url as "attachmentUrl",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM leave_requests
      WHERE id = ${id}
    `;
    
    await createAuditLog(
      actorId,
      "leave_request",
      id,
      "CANCEL",
      request,
      updated
    );

    const managers = requester?.teamId
      ? await db.queryAll<{ id: string }>`
          SELECT id
          FROM users
          WHERE role = 'MANAGER'
            AND is_active = true
            AND team_id = ${requester.teamId}
        `
      : await db.queryAll<{ id: string }>`
          SELECT id
          FROM users
          WHERE role = 'MANAGER'
            AND is_active = true
        `;

    for (const manager of managers) {
      await createNotification(
        manager.id,
        "REQUEST_CANCELLED",
        {
          requestId: id,
          userId: request.userId,
          userName: requester?.name,
          type: updated?.type,
          startDate: updated?.startDate,
          endDate: updated?.endDate,
          startTime: updated?.startTime,
          endTime: updated?.endTime,
          status: updated?.status,
          computedHours: updated?.computedHours,
        },
        `leave_request:${id}:cancelled:${manager.id}`
      );
    }

    return updated!;
  }
);


