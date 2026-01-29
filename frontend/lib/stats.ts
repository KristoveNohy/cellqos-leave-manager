import type { LeaveType } from "~backend/shared/types";

export const statsEventTypes: Array<{ value: LeaveType; label: string; color: string }> = [
  { value: "ANNUAL_LEAVE", label: "Dovolenka", color: "var(--color-chart-1)" },
  { value: "SICK_LEAVE", label: "PN", color: "var(--color-chart-2)" },
  { value: "HOME_OFFICE", label: "Home office", color: "var(--color-chart-3)" },
  { value: "UNPAID_LEAVE", label: "Neplatené voľno", color: "var(--color-chart-4)" },
  { value: "OTHER", label: "Iné", color: "var(--color-chart-5)" },
];

export const leaveTypeLabel = statsEventTypes.reduce<Record<LeaveType, string>>((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {} as Record<LeaveType, string>);

export function formatNumber(value: number, digits = 1) {
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(digits);
}

export function buildStatsQuery(filters: {
  year?: number;
  month?: number;
  quarter?: number;
  teamId?: number;
  memberIds?: string[];
  eventTypes?: LeaveType[];
}) {
  return {
    year: filters.year,
    month: filters.month,
    quarter: filters.quarter,
    teamId: filters.teamId,
    memberIds: filters.memberIds ?? [],
    eventTypes: filters.eventTypes ?? [],
  };
}
