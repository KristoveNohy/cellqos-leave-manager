import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";
import { validateDateRange, validateNotInPast } from "../shared/validation";
import { computeWorkingHours } from "../shared/date-utils";
import { createAuditLog } from "../shared/audit";
import { ensureAnnualLeaveBalance } from "../shared/leave-balance";
import type { LeaveRequest, LeaveType } from "../shared/types";

interface CreateLeaveRequestRequest {
  type: LeaveType;
  startDate: string;
  endDate: string;
  startTime?: string | null;
  endTime?: string | null;
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
        AND is_active = true
    `) {
      holidayDates.add(holiday.date);
    }
    
    const computedHours = computeWorkingHours(
      req.startDate,
      req.endDate,
      req.isHalfDayStart || false,
      req.isHalfDayEnd || false,
      holidayDates,
      req.startTime || null,
      req.endTime || null
    );

    if (req.type === "ANNUAL_LEAVE") {
      await ensureAnnualLeaveBalance({
        userId,
        startDate: req.startDate,
        requestedHours: computedHours,
      });
    }
    
    const result = await db.queryRow<{ id: number }>`
      INSERT INTO leave_requests (
        user_id, type, start_date, end_date, start_time, end_time,
        is_half_day_start, is_half_day_end,
        reason, computed_hours, status,
        created_at, updated_at
      ) VALUES (
        ${userId},
        ${req.type},
        ${req.startDate},
        ${req.endDate},
        ${req.startTime || null},
        ${req.endTime || null},
        ${req.isHalfDayStart || false},
        ${req.isHalfDayEnd || false},
        ${req.reason || null},
        ${computedHours},
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
        updated_at as "updatedAt"
      FROM leave_requests
      WHERE id = ${result!.id}
    `;
    
    await createAuditLog(
      userId,
      "leave_request",
      result!.id,
      "CREATE",
      null,
      leaveRequest
    );
    
    return leaveRequest!;
  }
);
