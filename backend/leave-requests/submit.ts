import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";
import { datesOverlap } from "../shared/date-utils";
import { createAuditLog, createNotification } from "../shared/audit";
import type { LeaveRequest } from "../shared/types";

interface SubmitLeaveRequestParams {
  id: number;
}

// Submits a leave request (DRAFT -> PENDING)
export const submit = api(
  { auth: true, expose: true, method: "POST", path: "/leave-requests/:id/submit" },
  async ({ id }: SubmitLeaveRequestParams): Promise<LeaveRequest> => {
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
    
    if (request.status !== "DRAFT") {
      throw APIError.failedPrecondition("Can only submit requests in DRAFT status");
    }
    
    // Check for overlaps
    const overlaps = await db.queryRow<{ count: number }>`
      SELECT COUNT(*) as count
      FROM leave_requests
      WHERE user_id = ${request.userId}
        AND id != ${id}
        AND status IN ('PENDING', 'APPROVED')
        AND start_date <= ${request.endDate}
        AND end_date >= ${request.startDate}
    `;
    
    if (overlaps && overlaps.count > 0) {
      throw APIError.failedPrecondition(
        "Request overlaps with existing pending or approved request"
      );
    }
    
    await db.exec`
      UPDATE leave_requests
      SET status = 'PENDING'
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
      auth.userID,
      "leave_requests",
      id,
      "SUBMIT",
      request,
      updated
    );
    
    // Notify managers
    const managers = await db.queryAll<{ id: string }>`
      SELECT id FROM users WHERE role = 'MANAGER' AND is_active = true
    `;
    
    for (const manager of managers) {
      await createNotification(
        manager.id,
        "NEW_PENDING_REQUEST",
        { requestId: id, userId: request.userId }
      );
    }
    
    return updated!;
  }
);
