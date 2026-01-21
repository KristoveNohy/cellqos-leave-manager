import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";
import { validateDateRange, validateNotInPast } from "../shared/validation";
import { computeWorkingDays } from "../shared/date-utils";
import { createAuditLog } from "../shared/audit";
import type { LeaveRequest, LeaveType } from "../shared/types";

interface CreateLeaveRequestRequest {
  type: LeaveType;
  startDate: string;
  endDate: string;
  isHalfDayStart?: boolean;
  isHalfDayEnd?: boolean;
  reason?: string;
}

export const create = api(
  { auth: true, expose: true, method: "POST", path: "/leave-requests" },
  async (req: CreateLeaveRequestRequest): Promise<LeaveRequest> => {
    const auth = getAuthData()!;
    const userId = auth.userID;
    validateDateRange(req.startDate, req.endDate);
    validateNotInPast(req.startDate);
    
    // Get holidays for computation
    const holidayDates = new Set<string>();
    for await (const holiday of db.query<{ date: string }>`
      SELECT date::text as date FROM holidays
      WHERE date >= ${req.startDate} AND date <= ${req.endDate}
    `) {
      holidayDates.add(holiday.date);
    }
    
    const computedDays = computeWorkingDays(
      req.startDate,
      req.endDate,
      req.isHalfDayStart || false,
      req.isHalfDayEnd || false,
      holidayDates
    );
    
    const result = await db.queryRow<{ id: number }>`
      INSERT INTO leave_requests (
        user_id, type, start_date, end_date,
        is_half_day_start, is_half_day_end,
        reason, computed_days, status,
        created_at, updated_at
      ) VALUES (
        ${userId},
        ${req.type},
        ${req.startDate},
        ${req.endDate},
        ${req.isHalfDayStart || false},
        ${req.isHalfDayEnd || false},
        ${req.reason || null},
        ${computedDays},
        'DRAFT',
        NOW(),
        NOW()
      )
      RETURNING id
    `;
    
    const leaveRequest = await db.queryRow<LeaveRequest>`
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
      WHERE id = ${result!.id}
    `;
    
    await createAuditLog(
      userId,
      "leave_requests",
      result!.id,
      "CREATE",
      null,
      leaveRequest
    );
    
    return leaveRequest!;
  }
);
