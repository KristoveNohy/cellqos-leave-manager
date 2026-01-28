import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";
import { isAdmin, isManager } from "../shared/rbac";
import type { LeaveRequest } from "../shared/types";

interface GetLeaveRequestParams {
  id: number;
}

// Gets a specific leave request by ID
export const get = api(
  { auth: true, expose: true, method: "GET", path: "/leave-requests/:id" },
  async ({ id }: GetLeaveRequestParams): Promise<LeaveRequest> => {
    const auth = getAuthData()!;
    const isAdminUser = isAdmin(auth.role);
    const isManagerUser = isManager(auth.role);
    const request = await db.queryRow<LeaveRequest & { teamId: number | null }>`
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
        computed_hours as "computedHours",
        attachment_url as "attachmentUrl",
        created_at as "createdAt",
        updated_at as "updatedAt",
        u.team_id as "teamId"
      FROM leave_requests
      JOIN users u ON leave_requests.user_id = u.id
      WHERE id = ${id}
    `;
    
    if (!request) {
      throw APIError.notFound("Leave request not found");
    }

    if (!isManagerUser && !isAdminUser && request.userId !== auth.userID) {
      throw APIError.permissionDenied("Cannot access another user's request");
    }

    if (isManagerUser && !isAdminUser && request.userId !== auth.userID) {
      const viewer = await db.queryRow<{ teamId: number | null }>`
        SELECT team_id as "teamId"
        FROM users
        WHERE id = ${auth.userID}
      `;
      if (!viewer || viewer.teamId === null || viewer.teamId !== request.teamId) {
        throw APIError.permissionDenied("Cannot access another team's request");
      }
    }
    
    return request;
  }
);
