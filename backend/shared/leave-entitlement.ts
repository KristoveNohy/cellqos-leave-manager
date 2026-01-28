import { HOURS_PER_WORKDAY } from "./date-utils";

const FULL_ALLOWANCE_WITH_CHILD_DAYS = 25;
const FULL_ALLOWANCE_STANDARD_DAYS = 20;
const FULL_ALLOWANCE_WITH_CHILD_HOURS = FULL_ALLOWANCE_WITH_CHILD_DAYS * HOURS_PER_WORKDAY;
const FULL_ALLOWANCE_STANDARD_HOURS = FULL_ALLOWANCE_STANDARD_DAYS * HOURS_PER_WORKDAY;

type AnnualLeaveAllowanceInput = {
  birthDate: string | null;
  hasChild: boolean;
  year: number;
  employmentStartDate?: string | null;
  manualAllowanceHours?: number | null;
  accrualPolicy?: "YEAR_START" | "PRO_RATA";
};

export function getAnnualLeaveGroupAllowanceHours({
  birthDate,
  hasChild,
  year,
}: Pick<AnnualLeaveAllowanceInput, "birthDate" | "hasChild" | "year">): number {
  if (hasChild) {
    return FULL_ALLOWANCE_WITH_CHILD_HOURS;
  }

  if (!birthDate) {
    return FULL_ALLOWANCE_STANDARD_HOURS;
  }

  const birthYear = Number(birthDate.slice(0, 4));
  const cutoffYear = year - 33;
  return birthYear <= cutoffYear ? FULL_ALLOWANCE_WITH_CHILD_HOURS : FULL_ALLOWANCE_STANDARD_HOURS;
}

function roundLeaveHours(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeAnnualLeaveAllowanceHours({
  birthDate,
  hasChild,
  year,
  employmentStartDate,
  manualAllowanceHours,
  accrualPolicy = "YEAR_START",
}: AnnualLeaveAllowanceInput): number {
  const baseAllowanceHours = getAnnualLeaveGroupAllowanceHours({ birthDate, hasChild, year });
  let allowanceHours = baseAllowanceHours;

  if (employmentStartDate) {
    const startDate = new Date(employmentStartDate);
    if (!Number.isNaN(startDate.getTime())) {
      const startYear = startDate.getFullYear();
      if (startYear > year) {
        return 0;
      }

      if (startYear === year) {
        if (manualAllowanceHours !== null && manualAllowanceHours !== undefined) {
          allowanceHours = manualAllowanceHours;
        } else if (accrualPolicy === "PRO_RATA") {
          const startMonth = startDate.getMonth() + 1;
          const monthsWorked = Math.max(0, 12 - startMonth + 1);
          allowanceHours = (baseAllowanceHours * monthsWorked) / 12;
        }
      }
    }
  }

  return roundLeaveHours(allowanceHours);
}

export function computeCarryOverHours({
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
