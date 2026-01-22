import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";
import { createAuditLog, createNotification } from "../shared/audit";
import { ensureAnnualLeaveBalance } from "../shared/leave-balance";
import { requireManager } from "../shared/rbac";
import type { LeaveRequest } from "../shared/types";

interface ApproveLeaveRequestParams {
  id: number;
  comment?: string;
  bulk?: boolean;
}

export const approve = api<ApproveLeaveRequestParams, LeaveRequest>(
  { auth: true, expose: true, method: "POST", path: "/leave-requests/:id/approve" },
  async (req): Promise<LeaveRequest> => {
    const { id, comment, bulk } = req;
    const auth = getAuthData()!;
    requireManager(auth.role);
    const request = await db.queryRow<LeaveRequest & { teamId: number | null }>`
      SELECT 
        lr.id, lr.user_id as "userId", lr.type,
        lr.start_date::text as "startDate",
        lr.end_date::text as "endDate",
        lr.start_time::text as "startTime",
        lr.end_time::text as "endTime",
        lr.is_half_day_start as "isHalfDayStart",
        lr.is_half_day_end as "isHalfDayEnd",
        lr.status, lr.reason, lr.manager_comment as "managerComment",
        lr.approved_by as "approvedBy",
        lr.approved_at as "approvedAt",
        lr.computed_days as "computedDays",
        lr.attachment_url as "attachmentUrl",
        lr.created_at as "createdAt",
        lr.updated_at as "updatedAt",
        u.team_id as "teamId"
      FROM leave_requests lr
      JOIN users u ON lr.user_id = u.id
      WHERE lr.id = ${id}
    `;
    
    if (!request) {
      throw APIError.notFound("Leave request not found");
    }
    
    if (request.status !== "PENDING") {
      throw APIError.failedPrecondition("Can only approve requests in PENDING status");
    }
    
    // Check team concurrent leave limit
    if (request.teamId) {
      const team = await db.queryRow<{ maxConcurrentLeaves: number | null }>`
        SELECT max_concurrent_leaves as "maxConcurrentLeaves"
        FROM teams
        WHERE id = ${request.teamId}
      `;
      
      if (team?.maxConcurrentLeaves) {
        // Count approved leaves that overlap with this request
        const count = await db.queryRow<{ count: number }>`
          SELECT COUNT(*) as count
          FROM leave_requests lr
          JOIN users u ON lr.user_id = u.id
          WHERE u.team_id = ${request.teamId}
            AND lr.status = 'APPROVED'
            AND lr.start_date <= ${request.endDate}
            AND lr.end_date >= ${request.startDate}
        `;
        
        if (count && count.count >= team.maxConcurrentLeaves) {
          throw APIError.failedPrecondition(
            `Team concurrent leave limit (${team.maxConcurrentLeaves}) would be exceeded`
          );
        }
      }
    }

    if (request.type === "ANNUAL_LEAVE") {
      await ensureAnnualLeaveBalance({
        userId: request.userId,
        startDate: request.startDate,
        requestedHours: request.computedDays,
        requestId: request.id,
      });
    }
    
    const approverId = auth.userID;
    
    await db.exec`
      UPDATE leave_requests
      SET status = 'APPROVED',
          approved_by = ${approverId},
          approved_at = NOW(),
          manager_comment = ${comment || null}
      WHERE id = ${id}
    `;
    
    const updated = await db.queryRow<LeaveRequest>`
      SELECT 
        id, user_id as "userId", type,
        start_date::text as "startDate",
        end_date::text as "endDate",
        start_time::text as "startTime",
        end_time::text as "endTime",
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
      "leave_request",
      id,
      bulk ? "BULK_APPROVE" : "APPROVE",
      request,
      updated
    );
    
    await createNotification(
      request.userId,
      "REQUEST_APPROVED",
      { requestId: id, startDate: updated?.startDate, endDate: updated?.endDate },
      `leave_request:${id}:approved`
    );
    
    return updated!;
  }
);
