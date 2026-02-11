type AnnualLeaveAllowanceInput = {
    birthDate: string | null;
    hasChild: boolean;
    year: number;
    employmentStartDate?: string | null;
    manualAllowanceHours?: number | null;
    accrualPolicy?: "YEAR_START" | "PRO_RATA";
};
export declare function getAnnualLeaveGroupAllowanceHours({ birthDate, hasChild, year, }: Pick<AnnualLeaveAllowanceInput, "birthDate" | "hasChild" | "year">): number;
export declare function computeAnnualLeaveAllowanceHours({ birthDate, hasChild, year, employmentStartDate, manualAllowanceHours, accrualPolicy, }: AnnualLeaveAllowanceInput): number;
export declare function computeCarryOverHours({ previousAllowance, previousUsed, carryOverLimit, }: {
    previousAllowance: number;
    previousUsed: number;
    carryOverLimit: number;
}): number;
export {};
