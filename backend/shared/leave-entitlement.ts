const FULL_ALLOWANCE_WITH_CHILD = 25;
const FULL_ALLOWANCE_STANDARD = 20;

type AnnualLeaveAllowanceInput = {
  birthDate: string | null;
  hasChild: boolean;
  year: number;
  employmentStartDate?: string | null;
  manualAllowanceDays?: number | null;
  accrualPolicy?: "YEAR_START" | "PRO_RATA";
};

export function getAnnualLeaveGroupAllowance({
  birthDate,
  hasChild,
  year,
}: Pick<AnnualLeaveAllowanceInput, "birthDate" | "hasChild" | "year">): number {
  if (hasChild) {
    return FULL_ALLOWANCE_WITH_CHILD;
  }

  if (!birthDate) {
    return FULL_ALLOWANCE_STANDARD;
  }

  const birthYear = Number(birthDate.slice(0, 4));
  const cutoffYear = year - 33;
  return birthYear <= cutoffYear ? FULL_ALLOWANCE_WITH_CHILD : FULL_ALLOWANCE_STANDARD;
}

function roundLeaveDays(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeAnnualLeaveAllowance({
  birthDate,
  hasChild,
  year,
  employmentStartDate,
  manualAllowanceDays,
  accrualPolicy = "YEAR_START",
}: AnnualLeaveAllowanceInput): number {
  const baseAllowance = getAnnualLeaveGroupAllowance({ birthDate, hasChild, year });
  let allowance = baseAllowance;

  if (employmentStartDate) {
    const startDate = new Date(employmentStartDate);
    if (!Number.isNaN(startDate.getTime())) {
      const startYear = startDate.getFullYear();
      if (startYear > year) {
        return 0;
      }

      if (startYear === year) {
        if (manualAllowanceDays !== null && manualAllowanceDays !== undefined) {
          allowance = manualAllowanceDays;
        } else if (accrualPolicy === "PRO_RATA") {
          const startMonth = startDate.getMonth() + 1;
          const monthsWorked = Math.max(0, 12 - startMonth + 1);
          allowance = (baseAllowance * monthsWorked) / 12;
        }
      }
    }
  }

  return roundLeaveDays(allowance);
}

export function computeCarryOverDays({
  previousAllowance,
  previousUsed,
  carryOverLimit,
}: {
  previousAllowance: number;
  previousUsed: number;
  carryOverLimit: number;
}): number {
  const remaining = Math.max(0, previousAllowance - previousUsed);
  return Math.min(remaining, carryOverLimit);
}
