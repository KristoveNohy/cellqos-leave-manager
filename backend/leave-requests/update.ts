import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";
import { validateDateRange, validateNotInPast } from "../shared/validation";
import { computeWorkingHours } from "../shared/date-utils";
import { createAuditLog, createNotification } from "../shared/audit";
import { ensureAnnualLeaveBalance } from "../shared/leave-balance";
import { canEditRequest, isAdmin, isManager } from "../shared/rbac";
import type { LeaveRequest, LeaveType } from "../shared/types";

interface UpdateLeaveRequestParams {
  id: number;
  type?: LeaveType;
  startDate?: string;
  endDate?: string;
  startTime?: string | null;
  endTime?: string | null;
  isHalfDayStart?: boolean;
  isHalfDayEnd?: boolean;
  reason?: string;
  managerComment?: string;
}

export const update = api<UpdateLeaveRequestParams, LeaveRequest>(
  { auth: true, expose: true, method: "PATCH", path: "/leave-requests/:id" },
  async (req): Promise<LeaveRequest> => {
    const {
      id,
      type,
      startDate,
      endDate,
      startTime,
      endTime,
      isHalfDayStart,
      isHalfDayEnd,
      reason,
      managerComment,
    } = req;
    const auth = getAuthData()!;
    const isAdminUser = isAdmin(auth.role);
    const isManagerUser = isManager(auth.role);
    const before = await db.queryRow<LeaveRequest & { teamId: number | null }>`
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
    
    if (!before) {
      throw APIError.notFound("Leave request not found");
    }

    let isSameTeam = before.userId === auth.userID;
    if (isManagerUser && !isAdminUser && before.userId !== auth.userID) {
      const viewer = await db.queryRow<{ teamId: number | null }>`
        SELECT team_id as "teamId"
        FROM users
        WHERE id = ${auth.userID}
      `;
      isSameTeam = Boolean(viewer?.teamId && viewer.teamId === before.teamId);
      if (!isSameTeam) {
        throw APIError.permissionDenied("You are not allowed to edit this request");
      }
    }

    if (!canEditRequest(before.userId, before.status, auth.userID, auth.role, isSameTeam)) {
      throw APIError.permissionDenied("You are not allowed to edit this request");
    }
    
    const newStartDate = startDate || before.startDate;
    const newEndDate = endDate || before.endDate;
    
    if (startDate || endDate) {
      validateDateRange(newStartDate, newEndDate);
      validateNotInPast(newStartDate, { allowPast: isManagerUser || isAdminUser });
      
      // Check for overlaps with other requests
      const overlaps = await db.queryRow<{ count: number }>`
        SELECT COUNT(*) as count
        FROM leave_requests
        WHERE user_id = ${before.userId}
          AND id != ${id}
          AND status IN ('PENDING', 'APPROVED')
          AND start_date <= ${newEndDate}
          AND end_date >= ${newStartDate}
      `;
      
      if (overlaps && overlaps.count > 0) {
        throw APIError.failedPrecondition(
          "Request overlaps with existing pending or approved request"
        );
      }
    }
    
    let computedHours = before.computedHours;
    if (
      startDate ||
      endDate ||
      isHalfDayStart !== undefined ||
      isHalfDayEnd !== undefined ||
      startTime !== undefined ||
      endTime !== undefined
    ) {
      const holidayDates = new Set<string>();
      for await (const holiday of db.query<{ date: string }>`
        SELECT date::text as date FROM holidays
        WHERE date >= ${newStartDate} AND date <= ${newEndDate}
          AND is_active = true
      `) {
        holidayDates.add(holiday.date);
      }
      
      computedHours = computeWorkingHours(
        newStartDate,
        newEndDate,
        isHalfDayStart ?? before.isHalfDayStart,
        isHalfDayEnd ?? before.isHalfDayEnd,
        holidayDates,
        startTime ?? before.startTime,
        endTime ?? before.endTime
      );
    }

    const effectiveType = type ?? before.type;
    if (effectiveType === "ANNUAL_LEAVE") {
      await ensureAnnualLeaveBalance({
        userId: before.userId,
        startDate: newStartDate,
        requestedHours: computedHours,
        requestId: id,
      });
    }
    
    const updates: string[] = [];
    const values: any[] = [];
    
    if (type !== undefined) {
      updates.push(`type = $${values.length + 1}`);
      values.push(type);
    }
    if (startDate !== undefined) {
      updates.push(`start_date = $${values.length + 1}`);
      values.push(startDate);
    }
    if (endDate !== undefined) {
      updates.push(`end_date = $${values.length + 1}`);
      values.push(endDate);
    }
    if (startTime !== undefined) {
      updates.push(`start_time = $${values.length + 1}`);
      values.push(startTime || null);
    }
    if (endTime !== undefined) {
      updates.push(`end_time = $${values.length + 1}`);
      values.push(endTime || null);
    }
    if (isHalfDayStart !== undefined) {
      updates.push(`is_half_day_start = $${values.length + 1}`);
      values.push(isHalfDayStart);
    }
    if (isHalfDayEnd !== undefined) {
      updates.push(`is_half_day_end = $${values.length + 1}`);
      values.push(isHalfDayEnd);
    }
    if (reason !== undefined) {
      updates.push(`reason = $${values.length + 1}`);
      values.push(reason || null);
    }
    if (managerComment !== undefined) {
      updates.push(`manager_comment = $${values.length + 1}`);
      values.push(managerComment || null);
    }
    if (computedHours !== before.computedHours) {
      updates.push(`computed_hours = $${values.length + 1}`);
      values.push(computedHours);
    }
    
    if (updates.length > 0) {
      values.push(id);
      await db.rawExec(
        `UPDATE leave_requests SET ${updates.join(", ")} WHERE id = $${values.length}`,
        ...values
      );
    }
    
    const after = await db.queryRow<LeaveRequest>`
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
      WHERE id = ${id}
    `;
    
    await createAuditLog(
      auth.userID,
      "leave_request",
      id,
      "UPDATE",
      before,
      after
    );

    if ((isManagerUser || isAdminUser) && before.userId !== auth.userID) {
      await createNotification(
        before.userId,
        "REQUEST_UPDATED_BY_MANAGER",
        {
          requestId: id,
          updatedBy: auth.userID,
          startDate: after?.startDate,
          endDate: after?.endDate,
          status: after?.status,
        },
        `leave_request:${id}:manager-update:${after?.updatedAt}`
      );
    }

    return after!;
  }
);
