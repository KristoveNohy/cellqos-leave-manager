import { APIError } from "encore.dev/api";
import db from "../db";

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

  const balance = await db.queryRow<{ allowanceDays: number }>`
    SELECT allowance_days as "allowanceDays"
    FROM leave_balances
    WHERE user_id = ${userId}
      AND year = EXTRACT(YEAR FROM ${startDate}::date)
  `;

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

  const allowanceDays = balance?.allowanceDays ?? 0;
  const bookedDays = Number(booked?.total ?? 0);
  const availableDays = allowanceDays - bookedDays;

  if (requestedDays > availableDays) {
    throw APIError.failedPrecondition(
      `Nedostatok dostupnej dovolenky. Zostatok: ${availableDays} dní.`
    );
  }
}
