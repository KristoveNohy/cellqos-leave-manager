import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";
import { validateDateRange, validateNotInPast } from "../shared/validation";
import { computeWorkingDays } from "../shared/date-utils";
import { createAuditLog, createNotification } from "../shared/audit";
import { canEditRequest } from "../shared/rbac";
import type { LeaveRequest, LeaveType } from "../shared/types";

interface UpdateLeaveRequestParams {
  id: number;
  type?: LeaveType;
  startDate?: string;
  endDate?: string;
  isHalfDayStart?: boolean;
  isHalfDayEnd?: boolean;
  reason?: string;
  managerComment?: string;
}

export const update = api<UpdateLeaveRequestParams, LeaveRequest>(
  { auth: true, expose: true, method: "PATCH", path: "/leave-requests/:id" },
  async (req): Promise<LeaveRequest> => {
    const { id, type, startDate, endDate, isHalfDayStart, isHalfDayEnd, reason, managerComment } = req;
    const auth = getAuthData()!;
    const before = await db.queryRow<LeaveRequest>`
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
    
    if (!before) {
      throw APIError.notFound("Leave request not found");
    }

    if (!canEditRequest(before.userId, before.status, auth.userID, auth.role)) {
      throw APIError.permissionDenied("You are not allowed to edit this request");
    }
    
    const newStartDate = startDate || before.startDate;
    const newEndDate = endDate || before.endDate;
    
    if (startDate || endDate) {
      validateDateRange(newStartDate, newEndDate);
      validateNotInPast(newStartDate);
      
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
    
    let computedDays = before.computedDays;
    if (startDate || endDate || isHalfDayStart !== undefined || isHalfDayEnd !== undefined) {
      const holidayDates = new Set<string>();
      for await (const holiday of db.query<{ date: string }>`
        SELECT date::text as date FROM holidays
        WHERE date >= ${newStartDate} AND date <= ${newEndDate}
          AND is_active = true
      `) {
        holidayDates.add(holiday.date);
      }
      
      computedDays = computeWorkingDays(
        newStartDate,
        newEndDate,
        isHalfDayStart ?? before.isHalfDayStart,
        isHalfDayEnd ?? before.isHalfDayEnd,
        holidayDates
      );
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
    if (computedDays !== before.computedDays) {
      updates.push(`computed_days = $${values.length + 1}`);
      values.push(computedDays);
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
      "leave_request",
      id,
      "UPDATE",
      before,
      after
    );

    if (auth.role === "MANAGER" && before.userId !== auth.userID) {
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
