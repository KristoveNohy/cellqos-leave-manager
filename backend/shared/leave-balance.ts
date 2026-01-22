import { APIError } from "encore.dev/api";
import db from "../db";

export function computeAnnualLeaveAllowance({
  birthDate,
  hasChild,
  year,
}: {
  birthDate: string | null;
  hasChild: boolean;
  year: number;
}): number {
  if (hasChild) {
    return 25;
  }

  if (!birthDate) {
    return 20;
  }

  const birthYear = Number(birthDate.slice(0, 4));
  const cutoffYear = year - 33;
  return birthYear <= cutoffYear ? 25 : 20;
}

async function getAnnualLeaveAllowance(userId: string, year: number): Promise<number> {
  const user = await db.queryRow<{ birthDate: string | null; hasChild: boolean }>`
    SELECT birth_date::text as "birthDate",
      has_child as "hasChild"
    FROM users
    WHERE id = ${userId}
  `;

  if (!user) {
    return 0;
  }

  return computeAnnualLeaveAllowance({
    birthDate: user.birthDate,
    hasChild: user.hasChild,
    year,
  });
}

type AnnualLeaveBalanceCheck = {
  userId: string;
  startDate: string;
  requestedDays: number;
  requestId?: number | null;
};

export async function ensureAnnualLeaveBalance({
  userId,
  startDate,
  requestedDays,
  requestId,
}: AnnualLeaveBalanceCheck): Promise<void> {
  if (requestedDays <= 0) {
    return;
  }

  const year = new Date(startDate).getFullYear();
  const allowanceDays = await getAnnualLeaveAllowance(userId, year);

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

  const bookedDays = Number(booked?.total ?? 0);
  const availableDays = allowanceDays - bookedDays;

  if (requestedDays > availableDays) {
    throw APIError.failedPrecondition(
      `Nedostatok dostupnej dovolenky. Zostatok: ${availableDays} dní.`
    );
  }
}
