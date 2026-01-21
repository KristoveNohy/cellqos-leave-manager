import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";
import type { LeaveRequest } from "../shared/types";

interface GetLeaveRequestParams {
  id: number;
}

// Gets a specific leave request by ID
export const get = api(
  { auth: true, expose: true, method: "GET", path: "/leave-requests/:id" },
  async ({ id }: GetLeaveRequestParams): Promise<LeaveRequest> => {
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

    if (auth.role !== "MANAGER" && request.userId !== auth.userID) {
      throw APIError.permissionDenied("Cannot access another user's request");
    }
    
    return request;
  }
);
