export function formatLeaveHours(hours: number): string {
  const rounded = Math.round(hours * 100) / 100;
  return `${formatHours(rounded)} hodín`;
}

function formatHours(hours: number): string {
  return Number.isInteger(hours) ? `${hours}` : hours.toFixed(2);
}
