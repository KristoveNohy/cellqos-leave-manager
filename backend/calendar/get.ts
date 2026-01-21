import { api, Query } from "encore.dev/api";
import db from "../db";
import type { LeaveRequest } from "../shared/types";

interface GetCalendarParams {
  startDate: Query<string>;
  endDate: Query<string>;
  teamId?: Query<number>;
}

interface CalendarEvent extends LeaveRequest {
  userName: string;
  userEmail: string;
}

interface GetCalendarResponse {
  events: CalendarEvent[];
}

// Gets calendar view with all leave requests in date range
export const get = api(
  { auth: true, expose: true, method: "GET", path: "/calendar" },
  async (params: GetCalendarParams): Promise<GetCalendarResponse> => {
    const conditions: string[] = [
      "lr.start_date <= $2",
      "lr.end_date >= $1",
      "lr.status != 'DRAFT'"
    ];
    const values: any[] = [params.startDate, params.endDate];
    
    if (params.teamId) {
      conditions.push(`u.team_id = $${values.length + 1}`);
      values.push(params.teamId);
    }
    
    const query = `
      SELECT 
        lr.id, lr.user_id as "userId", lr.type,
        lr.start_date::text as "startDate",
        lr.end_date::text as "endDate",
        lr.is_half_day_start as "isHalfDayStart",
        lr.is_half_day_end as "isHalfDayEnd",
        lr.status, lr.reason, lr.manager_comment as "managerComment",
        lr.approved_by as "approvedBy",
        lr.approved_at as "approvedAt",
        lr.computed_days as "computedDays",
        lr.attachment_url as "attachmentUrl",
        lr.created_at as "createdAt",
        lr.updated_at as "updatedAt",
        u.name as "userName",
        u.email as "userEmail"
      FROM leave_requests lr
      JOIN users u ON lr.user_id = u.id
      WHERE ${conditions.join(" AND ")}
      ORDER BY lr.start_date ASC
    `;
    
    const events: CalendarEvent[] = [];
    for await (const row of db.rawQuery<CalendarEvent>(query, ...values)) {
      events.push(row);
    }
    
    return { events };
  }
);
