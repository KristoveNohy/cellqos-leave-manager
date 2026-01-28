export function formatLeaveHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) {
    return "—";
  }

  const rounded = Math.round(hours * 100) / 100;
  const hoursLabel = Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(2);

  return `${hoursLabel} hodín`;
}
