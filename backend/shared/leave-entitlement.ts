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
