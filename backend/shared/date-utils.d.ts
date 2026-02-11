export declare function parseDate(dateStr: string): Date;
export declare function isWeekend(date: Date): boolean;
export declare function isHoliday(date: Date, holidays: Set<string>): boolean;
export declare function formatDate(date: Date): string;
export declare function addDays(date: Date, days: number): Date;
export declare const HOURS_PER_WORKDAY = 8;
export declare function computeWorkingHours(startDate: string, endDate: string, holidays: Set<string>, startTime?: string | null, endTime?: string | null): number;
export declare function datesOverlap(start1: string, end1: string, start2: string, end2: string): boolean;
