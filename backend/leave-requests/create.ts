import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";
import { validateDateRange, validateNotInPast } from "../shared/validation";
import { computeWorkingHours } from "../shared/date-utils";
import { createAuditLog, createNotification } from "../shared/audit";
import { ensureAnnualLeaveBalance } from "../shared/leave-balance";
import { isAdmin, isManager, isManagerOrAdmin } from "../shared/rbac";
import type { LeaveRequest, LeaveType } from "../shared/types";

interface CreateLeaveRequestRequest {
  userId?: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  startTime?: string | null;
  endTime?: string | null;
  reason?: string;
}

export const create = api(
  { auth: true, expose: true, method: "POST", path: "/leave-requests" },
  async (req: CreateLeaveRequestRequest): Promise<LeaveRequest> => {
    const auth = getAuthData()!;
    const actorUserId = auth.userID;
    const allowPast = isAdmin(auth.role) || isManager(auth.role);
    const requestedUserId = req.userId?.trim();
    const targetUserId = requestedUserId || actorUserId;
    validateDateRange(req.startDate, req.endDate);
    validateNotInPast(req.startDate, { allowPast });

    if (targetUserId !== actorUserId && !isManagerOrAdmin(auth.role)) {
      throw APIError.permissionDenied("You can only create leave requests for yourself");
    }

    const actor = await db.queryRow<{ teamId: number | null }>`
      SELECT team_id as "teamId"
      FROM users
      WHERE id = ${actorUserId}
    `;

    const targetUser = await db.queryRow<{
      id: string;
      name: string;
      teamId: number | null;
      workingHoursPerDay: number;
      isActive: boolean;
    }>`
      SELECT
        id,
        name,
        team_id as "teamId",
        working_hours_per_day as "workingHoursPerDay",
        is_active as "isActive"
      FROM users
      WHERE id = ${targetUserId}
    `;

    if (!targetUser || !targetUser.isActive) {
      throw APIError.notFound("Target user not found");
    }

    if (isManager(auth.role) && !isAdmin(auth.role) && targetUserId !== actorUserId) {
      if (actor?.teamId === null || actor?.teamId !== targetUser.teamId) {
        throw APIError.permissionDenied("Managers can only create leave requests for users in their team");
      }
    }

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
      holidayDates,
      Number(targetUser.workingHoursPerDay ?? 8),
      req.startTime || null,
      req.endTime || null
    );

    const overlaps = await db.queryRow<{ count: number }>`
      SELECT COUNT(*) as count
      FROM leave_requests
      WHERE user_id = ${targetUserId}
        AND status IN ('PENDING', 'APPROVED')
        AND start_date <= ${req.endDate}
        AND end_date >= ${req.startDate}
    `;

    if (overlaps && overlaps.count > 0) {
      throw APIError.failedPrecondition("Request overlaps with existing pending or approved request");
    }

    if (req.type === "ANNUAL_LEAVE") {
      await ensureAnnualLeaveBalance({
        userId: targetUserId,
        startDate: req.startDate,
        requestedHours: computedHours,
      });
    }
    
    const result = await db.queryRow<{ id: number }>`
      INSERT INTO leave_requests (
        user_id, type, start_date, end_date, start_time, end_time,
        reason, computed_hours, status,
        created_at, updated_at
      ) VALUES (
        ${targetUserId},
        ${req.type},
        ${req.startDate},
        ${req.endDate},
        ${req.startTime || null},
        ${req.endTime || null},
        ${req.reason || null},
        ${computedHours},
        'PENDING',
        NOW(),
        NOW()
      )
      RETURNING id
    `;
    
    const leaveRequest = await db.queryRow<LeaveRequest>`
      SELECT 
        id, user_id as "userId", type,
        start_date::date::text as "startDate",
        end_date::date::text as "endDate",
        start_time::text as "startTime",
        end_time::text as "endTime",
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
      actorUserId,
      "leave_request",
      result!.id,
      "CREATE",
      null,
      leaveRequest
    );

    const notificationPayload = {
      requestId: leaveRequest!.id,
      userId: leaveRequest!.userId,
      userName: targetUser.name,
      type: leaveRequest?.type,
      startDate: leaveRequest?.startDate,
      endDate: leaveRequest?.endDate,
      startTime: leaveRequest?.startTime,
      endTime: leaveRequest?.endTime,
      status: leaveRequest?.status,
      computedHours: leaveRequest?.computedHours,
    };

    const notificationJobs: Promise<unknown>[] = [];
    notificationJobs.push(
      createNotification(
        leaveRequest!.userId,
        "REQUEST_SUBMITTED",
        notificationPayload,
        `leave_request:${leaveRequest!.id}:submitted:requester`
      )
    );

    const managers = targetUser.teamId
      ? await db.queryAll<{ id: string }>`
          SELECT id
          FROM users
          WHERE role = 'MANAGER'
            AND is_active = true
            AND team_id = ${targetUser.teamId}
        `
      : await db.queryAll<{ id: string }>`
          SELECT id
          FROM users
          WHERE role = 'MANAGER'
            AND is_active = true
        `;

    for (const manager of managers) {
      notificationJobs.push(
        createNotification(
          manager.id,
          "NEW_PENDING_REQUEST",
          notificationPayload,
          `leave_request:${leaveRequest!.id}:submitted:${manager.id}`
        )
      );
    }

    const admins = await db.queryAll<{ id: string }>`
      SELECT id
      FROM users
      WHERE role = 'ADMIN'
        AND is_active = true
    `;
    for (const admin of admins) {
      notificationJobs.push(
        createNotification(
          admin.id,
          "NEW_PENDING_REQUEST",
          notificationPayload,
          `leave_request:${leaveRequest!.id}:submitted:${admin.id}`
        )
      );
    }

    void Promise.allSettled(notificationJobs).then((results) => {
      const failedCount = results.filter((result) => result.status === "rejected").length;
      if (failedCount > 0) {
        console.warn(`Leave request ${leaveRequest!.id}: ${failedCount} notification(s) failed`);
      }
    });
    
    return leaveRequest!;
  }
);

