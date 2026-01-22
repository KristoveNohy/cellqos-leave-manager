import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";

interface LeaveBalanceSummary {
  year: number;
  allowanceDays: number;
  usedDays: number;
  remainingDays: number;
}

export const me = api(
  { auth: true, expose: true, method: "GET", path: "/leave-balances/me" },
  async (): Promise<LeaveBalanceSummary> => {
    const auth = getAuthData()!;
    const year = new Date().getFullYear();

    const balance = await db.queryRow<{ allowanceDays: number }>`
      SELECT allowance_days as "allowanceDays"
      FROM leave_balances
      WHERE user_id = ${auth.userID}
        AND year = ${year}
    `;

    const booked = await db.queryRow<{ total: number }>`
      SELECT COALESCE(SUM(computed_days), 0) as total
      FROM leave_requests
      WHERE user_id = ${auth.userID}
        AND type = 'ANNUAL_LEAVE'
        AND status IN ('PENDING', 'APPROVED')
        AND EXTRACT(YEAR FROM start_date) = ${year}
    `;

    const allowanceDays = balance?.allowanceDays ?? 0;
    const usedDays = Number(booked?.total ?? 0);
    const remainingDays = allowanceDays - usedDays;

    return {
      year,
      allowanceDays,
      usedDays,
      remainingDays,
    };
  }
);
