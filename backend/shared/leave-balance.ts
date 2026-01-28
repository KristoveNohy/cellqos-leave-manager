import { APIError } from "encore.dev/api";
import db from "../db";
import {
  computeAnnualLeaveAllowanceHours,
  computeCarryOverHours,
  getAnnualLeaveGroupAllowanceHours,
} from "./leave-entitlement";
import { formatLeaveHours } from "./leave-format";

export async function getAnnualLeaveAllowanceHours(userId: string, year: number): Promise<number> {
  const user = await db.queryRow<{
    birthDate: string | null;
    hasChild: boolean;
    employmentStartDate: string | null;
    manualLeaveAllowanceHours: number | null;
  }>`
    SELECT birth_date::text as "birthDate",
      has_child as "hasChild",
      employment_start_date::text as "employmentStartDate",
      manual_leave_allowance_hours as "manualLeaveAllowanceHours"
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

  const baseAllowanceHours = computeAnnualLeaveAllowanceHours({
    birthDate: user.birthDate,
    hasChild: user.hasChild,
    year,
    employmentStartDate: user.employmentStartDate,
    manualAllowanceHours: user.manualLeaveAllowanceHours,
    accrualPolicy,
  });

  if (!carryOverEnabled) {
    return baseAllowanceHours;
  }

  const previousYear = year - 1;
  const previousAllowanceHours = computeAnnualLeaveAllowanceHours({
    birthDate: user.birthDate,
    hasChild: user.hasChild,
    year: previousYear,
    employmentStartDate: user.employmentStartDate,
    manualAllowanceHours: user.manualLeaveAllowanceHours,
    accrualPolicy,
  });

  const previousUsed = await db.queryRow<{ total: number }>`
    SELECT COALESCE(SUM(computed_hours), 0) as total
    FROM leave_requests
    WHERE user_id = ${userId}
      AND type = 'ANNUAL_LEAVE'
      AND status IN ('PENDING', 'APPROVED')
      AND EXTRACT(YEAR FROM start_date) = ${previousYear}
  `;

  const carryOverLimitHours = getAnnualLeaveGroupAllowanceHours({
    birthDate: user.birthDate,
    hasChild: user.hasChild,
    year,
  });

  const carryOverHours = computeCarryOverHours({
    previousAllowance: previousAllowanceHours,
    previousUsed: Number(previousUsed?.total ?? 0),
    carryOverLimit: carryOverLimitHours,
  });

  return baseAllowanceHours + carryOverHours;
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
  const allowanceHours = await getAnnualLeaveAllowanceHours(userId, year);

  const booked = requestId
    ? await db.queryRow<{ total: number }>`
        SELECT COALESCE(SUM(computed_hours), 0) as total
        FROM leave_requests
        WHERE user_id = ${userId}
          AND type = 'ANNUAL_LEAVE'
          AND status IN ('PENDING', 'APPROVED')
          AND EXTRACT(YEAR FROM start_date) = EXTRACT(YEAR FROM ${startDate}::date)
          AND id != ${requestId}
      `
    : await db.queryRow<{ total: number }>`
        SELECT COALESCE(SUM(computed_hours), 0) as total
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
