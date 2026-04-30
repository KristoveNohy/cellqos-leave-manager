import { HOURS_PER_WORKDAY } from "./date-utils";

const FULL_ALLOWANCE_WITH_CHILD_DAYS = 25;
const FULL_ALLOWANCE_STANDARD_DAYS = 20;

type AnnualLeaveAllowanceInput = {
  birthDate: string | null;
  hasChild: boolean;
  year: number;
  workingHoursPerDay?: number;
  employmentStartDate?: string | null;
  manualAllowanceHours?: number | null;
  accrualPolicy?: "YEAR_START" | "PRO_RATA";
};

export function getAnnualLeaveGroupAllowanceHours({
  birthDate,
  hasChild,
  year,
  workingHoursPerDay = HOURS_PER_WORKDAY,
}: Pick<AnnualLeaveAllowanceInput, "birthDate" | "hasChild" | "year" | "workingHoursPerDay">): number {
  const fullAllowanceWithChildHours = FULL_ALLOWANCE_WITH_CHILD_DAYS * workingHoursPerDay;
  const fullAllowanceStandardHours = FULL_ALLOWANCE_STANDARD_DAYS * workingHoursPerDay;

  if (hasChild) {
    return fullAllowanceWithChildHours;
  }

  if (!birthDate) {
    return fullAllowanceStandardHours;
  }

  const birthYear = Number(birthDate.slice(0, 4));
  const cutoffYear = year - 33;
  return birthYear <= cutoffYear ? fullAllowanceWithChildHours : fullAllowanceStandardHours;
}

function roundLeaveHours(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeAnnualLeaveAllowanceHours({
  birthDate,
  hasChild,
  year,
  workingHoursPerDay = HOURS_PER_WORKDAY,
  employmentStartDate,
  manualAllowanceHours,
  accrualPolicy = "YEAR_START",
}: AnnualLeaveAllowanceInput): number {
  const baseAllowanceHours = getAnnualLeaveGroupAllowanceHours({
    birthDate,
    hasChild,
    year,
    workingHoursPerDay,
  });
  let allowanceHours = baseAllowanceHours;

  if (employmentStartDate) {
    const startDate = new Date(employmentStartDate);
    if (!Number.isNaN(startDate.getTime())) {
      const startYear = startDate.getFullYear();
      if (startYear > year) {
        return 0;
      }

      if (manualAllowanceHours !== null && manualAllowanceHours !== undefined) {
        return roundLeaveHours(manualAllowanceHours);
      }

      if (startYear === year) {
        if (accrualPolicy === "PRO_RATA") {
          const startMonth = startDate.getMonth() + 1;
          const monthsWorked = Math.max(0, 12 - startMonth + 1);
          allowanceHours = (baseAllowanceHours * monthsWorked) / 12;
        }
      }
    }
  }

  if (manualAllowanceHours !== null && manualAllowanceHours !== undefined) {
    return roundLeaveHours(manualAllowanceHours);
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
