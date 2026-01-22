import { HOURS_PER_WORKDAY } from "./date-utils";

export function formatLeaveHours(hours: number): string {
  const rounded = Math.round(hours * 100) / 100;
  const days = Math.floor(rounded / HOURS_PER_WORKDAY);
  const remainingHours = Math.round((rounded - days * HOURS_PER_WORKDAY) * 100) / 100;
  return `${days} dní ${formatHours(remainingHours)} hodín`;
}

function formatHours(hours: number): string {
  return Number.isInteger(hours) ? `${hours}` : hours.toFixed(2);
}
