import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";
import { getAnnualLeaveAllowanceHours } from "../shared/leave-balance";

interface LeaveBalanceSummary {
  year: number;
  allowanceHours: number;
  usedHours: number;
  remainingHours: number;
}

export const me = api(
  { auth: true, expose: true, method: "GET", path: "/leave-balances/me" },
  async (): Promise<LeaveBalanceSummary> => {
    const auth = getAuthData()!;
    const year = new Date().getFullYear();

    const booked = await db.queryRow<{ total: number }>`
      SELECT COALESCE(SUM(computed_hours), 0) as total
      FROM leave_requests
      WHERE user_id = ${auth.userID}
        AND type = 'ANNUAL_LEAVE'
        AND status IN ('PENDING', 'APPROVED')
        AND EXTRACT(YEAR FROM start_date) = ${year}
    `;

    const allowanceHours = await getAnnualLeaveAllowanceHours(auth.userID, year);
    const usedHours = Number(booked?.total ?? 0);
    const remainingHours = allowanceHours - usedHours;

    return {
      year,
      allowanceHours,
      usedHours,
      remainingHours,
    };
  }
);
