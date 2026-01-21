import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";
import { createAuditLog, createNotification } from "../shared/audit";
import type { LeaveRequest } from "../shared/types";

interface CancelLeaveRequestParams {
  id: number;
}

// Cancels a leave request
export const cancel = api(
  { auth: true, expose: true, method: "POST", path: "/leave-requests/:id/cancel" },
  async ({ id }: CancelLeaveRequestParams): Promise<LeaveRequest> => {
    const auth = getAuthData()!;
    const request = await db.queryRow<LeaveRequest>`
      SELECT 
        id, user_id as "userId", type,
        start_date::text as "startDate",
        end_date::text as "endDate",
        is_half_day_start as "isHalfDayStart",
        is_half_day_end as "isHalfDayEnd",
        status, reason, manager_comment as "managerComment",
        approved_by as "approvedBy",
        approved_at as "approvedAt",
        computed_days as "computedDays",
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

    if (auth.role !== "MANAGER" && request.userId !== auth.userID) {
      throw APIError.permissionDenied("Cannot cancel another user's request");
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
        start_date::text as "startDate",
        end_date::text as "endDate",
        is_half_day_start as "isHalfDayStart",
        is_half_day_end as "isHalfDayEnd",
        status, reason, manager_comment as "managerComment",
        approved_by as "approvedBy",
        approved_at as "approvedAt",
        computed_days as "computedDays",
        attachment_url as "attachmentUrl",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM leave_requests
      WHERE id = ${id}
    `;
    
    await createAuditLog(
      actorId,
      "leave_requests",
      id,
      "CANCEL",
      request,
      updated
    );
    
    return updated!;
  }
);
