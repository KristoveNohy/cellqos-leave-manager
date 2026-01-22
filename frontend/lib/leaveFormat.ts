export const HOURS_PER_WORKDAY = 8;

export function formatLeaveHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) {
    return "—";
  }

  const rounded = Math.round(hours * 100) / 100;
  const days = Math.floor(rounded / HOURS_PER_WORKDAY);
  const remainingHours = Math.round((rounded - days * HOURS_PER_WORKDAY) * 100) / 100;
  const hoursLabel = Number.isInteger(remainingHours) ? `${remainingHours}` : remainingHours.toFixed(2);

  return `${days} dní ${hoursLabel} hodín`;
}
