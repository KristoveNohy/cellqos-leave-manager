import { APIError } from "encore.dev/api";
import db from "../db";
import {
  computeAnnualLeaveAllowance,
  computeCarryOverDays,
  getAnnualLeaveGroupAllowance,
} from "./leave-entitlement";
import { HOURS_PER_WORKDAY } from "./date-utils";
import { formatLeaveHours } from "./leave-format";

export async function getAnnualLeaveAllowance(userId: string, year: number): Promise<number> {
  const user = await db.queryRow<{
    birthDate: string | null;
    hasChild: boolean;
    employmentStartDate: string | null;
    manualLeaveAllowanceDays: number | null;
  }>`
    SELECT birth_date::text as "birthDate",
      has_child as "hasChild",
      employment_start_date::text as "employmentStartDate",
      manual_leave_allowance_days as "manualLeaveAllowanceDays"
    FROM users
    WHERE id = ${userId}
  `;

  if (!user) {
    return 0;
  }

  const policy = await db.queryRow<{
    accrualPolicy: "YEAR_START" | "PRO_RATA";
    carryOverEnabled: boolean;
  }>`
    SELECT annual_leave_accrual_policy as "accrualPolicy",
      carry_over_enabled as "carryOverEnabled"
    FROM settings
    LIMIT 1
  `;

  const accrualPolicy = policy?.accrualPolicy ?? "YEAR_START";
  const carryOverEnabled = policy?.carryOverEnabled ?? false;

  const baseAllowanceDays = computeAnnualLeaveAllowance({
    birthDate: user.birthDate,
    hasChild: user.hasChild,
    year,
    employmentStartDate: user.employmentStartDate,
    manualAllowanceDays: user.manualLeaveAllowanceDays,
    accrualPolicy,
  });

  if (!carryOverEnabled) {
    return baseAllowanceDays * HOURS_PER_WORKDAY;
  }

  const previousYear = year - 1;
  const previousAllowanceDays = computeAnnualLeaveAllowance({
    birthDate: user.birthDate,
    hasChild: user.hasChild,
    year: previousYear,
    employmentStartDate: user.employmentStartDate,
    manualAllowanceDays: user.manualLeaveAllowanceDays,
    accrualPolicy,
  });

  const previousUsed = await db.queryRow<{ total: number }>`
    SELECT COALESCE(SUM(computed_days), 0) as total
    FROM leave_requests
    WHERE user_id = ${userId}
      AND type = 'ANNUAL_LEAVE'
      AND status IN ('PENDING', 'APPROVED')
      AND EXTRACT(YEAR FROM start_date) = ${previousYear}
  `;

  const carryOverLimit = getAnnualLeaveGroupAllowance({
    birthDate: user.birthDate,
    hasChild: user.hasChild,
    year,
  });

  const carryOverDays = computeCarryOverDays({
    previousAllowance: previousAllowanceDays,
    previousUsed: Number(previousUsed?.total ?? 0) / HOURS_PER_WORKDAY,
    carryOverLimit,
  });

  return (baseAllowanceDays + carryOverDays) * HOURS_PER_WORKDAY;
}

type AnnualLeaveBalanceCheck = {
  userId: string;
  startDate: string;
  requestedHours: number;
  requestId?: number | null;
};

export async function ensureAnnualLeaveBalance({
  userId,
  startDate,
  requestedHours,
  requestId,
}: AnnualLeaveBalanceCheck): Promise<void> {
  if (requestedHours <= 0) {
    return;
  }

  const year = new Date(startDate).getFullYear();
  const allowanceHours = await getAnnualLeaveAllowance(userId, year);

  const booked = requestId
    ? await db.queryRow<{ total: number }>`
        SELECT COALESCE(SUM(computed_days), 0) as total
        FROM leave_requests
        WHERE user_id = ${userId}
          AND type = 'ANNUAL_LEAVE'
          AND status IN ('PENDING', 'APPROVED')
          AND EXTRACT(YEAR FROM start_date) = EXTRACT(YEAR FROM ${startDate}::date)
          AND id != ${requestId}
      `
    : await db.queryRow<{ total: number }>`
        SELECT COALESCE(SUM(computed_days), 0) as total
        FROM leave_requests
        WHERE user_id = ${userId}
          AND type = 'ANNUAL_LEAVE'
          AND status IN ('PENDING', 'APPROVED')
          AND EXTRACT(YEAR FROM start_date) = EXTRACT(YEAR FROM ${startDate}::date)
      `;

  const bookedHours = Number(booked?.total ?? 0);
  const availableHours = allowanceHours - bookedHours;

  if (requestedHours > availableHours) {
    throw APIError.failedPrecondition(
      `Nedostatok dostupnej dovolenky. Zostatok: ${formatLeaveHours(availableHours)}.`
    );
  }
}
