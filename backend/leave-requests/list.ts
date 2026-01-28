import { api, APIError, Query } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";
import { isAdmin, isManager } from "../shared/rbac";
import type { LeaveRequest, LeaveStatus, LeaveType } from "../shared/types";

interface ListLeaveRequestsParams {
  userId?: Query<string>;
  status?: Query<LeaveStatus>;
  type?: Query<LeaveType>;
  startDate?: Query<string>;
  endDate?: Query<string>;
  teamId?: Query<number>;
}

interface ListLeaveRequestsResponse {
  requests: LeaveRequest[];
}

// Lists leave requests with optional filters
export const list = api(
  { auth: true, expose: true, method: "GET", path: "/leave-requests" },
  async (params: ListLeaveRequestsParams): Promise<ListLeaveRequestsResponse> => {
    const auth = getAuthData()!;
    const isAdminUser = isAdmin(auth.role);
    const isManagerUser = isManager(auth.role);
    let viewerTeamId: number | null = null;
    if (isManagerUser && !isAdminUser) {
      const viewer = await db.queryRow<{ teamId: number | null }>`
        SELECT team_id as "teamId"
        FROM users
        WHERE id = ${auth.userID}
      `;
      viewerTeamId = viewer?.teamId ?? null;
    }
    const conditions: string[] = ["1=1"];
    const values: any[] = [];
    
    if (params.userId) {
      if (!isManagerUser && !isAdminUser && params.userId !== auth.userID) {
        throw APIError.permissionDenied("Not allowed to view other users' requests");
      }
      if (isManagerUser && !isAdminUser && params.userId !== auth.userID) {
        const target = await db.queryRow<{ teamId: number | null }>`
          SELECT team_id as "teamId"
          FROM users
          WHERE id = ${params.userId}
        `;
        if (!target || viewerTeamId === null || target.teamId !== viewerTeamId) {
          throw APIError.permissionDenied("Not allowed to view other teams' requests");
        }
      }
      conditions.push(`lr.user_id = $${values.length + 1}`);
      values.push(params.userId);
    }

    if (!isManagerUser && !isAdminUser && !params.userId) {
      conditions.push(`lr.user_id = $${values.length + 1}`);
      values.push(auth.userID);
    }

    if (isManagerUser && !isAdminUser && !params.userId) {
      if (viewerTeamId === null) {
        conditions.push("1=0");
      } else {
        conditions.push(`u.team_id = $${values.length + 1}`);
        values.push(viewerTeamId);
      }
    }
    
    if (params.status) {
      conditions.push(`lr.status = $${values.length + 1}`);
      values.push(params.status);
    }
    
    if (params.type) {
      conditions.push(`lr.type = $${values.length + 1}`);
      values.push(params.type);
    }
    
    if (params.startDate) {
      conditions.push(`lr.end_date >= $${values.length + 1}`);
      values.push(params.startDate);
    }
    
    if (params.endDate) {
      conditions.push(`lr.start_date <= $${values.length + 1}`);
      values.push(params.endDate);
    }
    
    if (params.teamId) {
      if (isManagerUser && !isAdminUser && params.teamId !== viewerTeamId) {
        throw APIError.permissionDenied("Not allowed to view other teams' requests");
      }
      conditions.push(`u.team_id = $${values.length + 1}`);
      values.push(params.teamId);
    }
    
    const query = `
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
        lr.computed_hours as "computedHours",
        lr.attachment_url as "attachmentUrl",
        lr.created_at as "createdAt",
        lr.updated_at as "updatedAt"
      FROM leave_requests lr
      LEFT JOIN users u ON lr.user_id = u.id
      WHERE ${conditions.join(" AND ")}
      ORDER BY lr.start_date DESC, lr.created_at DESC
    `;
    
    const requests: LeaveRequest[] = [];
    for await (const row of db.rawQuery<LeaveRequest>(query, ...values)) {
      requests.push(row);
    }
    
    return { requests };
  }
);
