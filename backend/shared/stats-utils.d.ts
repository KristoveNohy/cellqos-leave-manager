import type { LeaveType } from "./types";
export declare const STATS_EVENT_TYPES: LeaveType[];
export declare function parseCsvList(value?: string): string[];
export declare function isValidLeaveType(value: string): value is LeaveType;
export declare function buildStatsDateRange({ year, month, quarter, }: {
    year: number;
    month?: number;
    quarter?: number;
}): {
    startDate: string;
    endDate: string;
    months: number[];
};
