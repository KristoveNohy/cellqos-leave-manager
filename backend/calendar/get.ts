import { api, APIError, Query } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";
import { isAdmin, isManager } from "../shared/rbac";
import type { LeaveRequest } from "../shared/types";

interface GetCalendarParams {
  startDate: Query<string>;
  endDate: Query<string>;
  teamId?: Query<number>;
}

interface CalendarEvent extends LeaveRequest {
  userName: string;
  userEmail: string;
  teamId: number | null;
}

interface GetCalendarResponse {
  events: CalendarEvent[];
}

// Gets calendar view with all leave requests in date range
export const get = api(
  { auth: true, expose: true, method: "GET", path: "/calendar" },
  async (params: GetCalendarParams): Promise<GetCalendarResponse> => {
    const auth = getAuthData()!;
    const isAdminUser = isAdmin(auth.role);
    const isManagerUser = isManager(auth.role);
    const viewerId = auth.userID;
    let viewerTeamId: number | null = null;
    let showTeamCalendarForEmployees = false;
    try {
      const settings = await db.queryRow<{ showTeamCalendarForEmployees: boolean }>`
        SELECT show_team_calendar_for_employees as "showTeamCalendarForEmployees"
        FROM settings
        LIMIT 1
      `;
      showTeamCalendarForEmployees = settings?.showTeamCalendarForEmployees ?? false;
    } catch {
      showTeamCalendarForEmployees = false;
    }

    if (!isAdminUser) {
      const viewer = await db.queryRow<{ teamId: number | null }>`
        SELECT team_id as "teamId"
        FROM users
        WHERE id = ${viewerId}
      `;

      if (!viewer) {
        throw APIError.notFound("User not found");
      }

      viewerTeamId = viewer.teamId;
    }

    const conditions: string[] = [
      "lr.start_date <= $2",
      "lr.end_date >= $1",
      "lr.status != 'DRAFT'",
      "lr.status != 'REJECTED'",
    ];
    const values: any[] = [params.startDate, params.endDate];

    if ((isManagerUser || isAdminUser) && params.teamId) {
      conditions.push(`u.team_id = $${values.length + 1}`);
      values.push(params.teamId);
    }

    if (!isManagerUser && !isAdminUser) {
      if (showTeamCalendarForEmployees && viewerTeamId) {
        conditions.push(`u.team_id = $${values.length + 1}`);
        values.push(viewerTeamId);
      } else {
        conditions.push(`lr.user_id = $${values.length + 1}`);
        values.push(viewerId);
      }
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
        lr.updated_at as "updatedAt",
        u.name as "userName",
        u.email as "userEmail",
        u.team_id as "teamId"
      FROM leave_requests lr
      JOIN users u ON lr.user_id = u.id
      WHERE ${conditions.join(" AND ")}
      ORDER BY lr.start_date ASC
    `;
    
    const events: CalendarEvent[] = [];
    for await (const row of db.rawQuery<CalendarEvent>(query, ...values)) {
      if (!isAdminUser && row.userId !== viewerId) {
        const isSameTeam = viewerTeamId !== null && viewerTeamId === row.teamId;
        if (!isManagerUser || !isSameTeam) {
          row.reason = null;
          row.managerComment = null;
        }
      }
      events.push(row);
    }
    
    return { events };
  }
);
