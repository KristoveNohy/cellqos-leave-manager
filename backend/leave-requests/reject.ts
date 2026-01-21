import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";
import { createAuditLog, createNotification } from "../shared/audit";
import { requireManager } from "../shared/rbac";
import type { LeaveRequest } from "../shared/types";

interface RejectLeaveRequestParams {
  id: number;
  comment: string;
}

export const reject = api<RejectLeaveRequestParams, LeaveRequest>(
  { auth: true, expose: true, method: "POST", path: "/leave-requests/:id/reject" },
  async (req): Promise<LeaveRequest> => {
    const { id, comment } = req;
    const auth = getAuthData()!;
    requireManager(auth.role);
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
    
    if (request.status !== "PENDING") {
      throw APIError.failedPrecondition("Can only reject requests in PENDING status");
    }
    
    const approverId = auth.userID;
    
    await db.exec`
      UPDATE leave_requests
      SET status = 'REJECTED',
          approved_by = ${approverId},
          approved_at = NOW(),
          manager_comment = ${comment}
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
      approverId,
      "leave_requests",
      id,
      "REJECT",
      request,
      updated
    );
    
    await createNotification(
      request.userId,
      "REQUEST_REJECTED",
      { requestId: id }
    );
    
    return updated!;
  }
);
