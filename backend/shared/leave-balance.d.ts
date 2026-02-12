export declare function getAnnualLeaveAllowanceHours(userId: string, year: number): Promise<number>;
type AnnualLeaveBalanceCheck = {
    userId: string;
    startDate: string;
    requestedHours: number;
    requestId?: number | null;
};
export declare function ensureAnnualLeaveBalance({ userId, startDate, requestedHours, requestId, }: AnnualLeaveBalanceCheck): Promise<void>;
export {};
