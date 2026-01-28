export function parseDate(dateStr: string): Date {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${dateStr}`);
  }
  return date;
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6; // Sunday or Saturday
}

export function isHoliday(date: Date, holidays: Set<string>): boolean {
  const dateStr = formatDate(date);
  return holidays.has(dateStr);
}

export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export const HOURS_PER_WORKDAY = 8;

function parseTimeToMinutes(time: string): number | null {
  const parts = time.split(":");
  if (parts.length < 2) {
    return null;
  }
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }
  return hours * 60 + minutes;
}

export function computeWorkingHours(
  startDate: string,
  endDate: string,
  isHalfDayStart: boolean,
  isHalfDayEnd: boolean,
  holidays: Set<string>,
  startTime?: string | null,
  endTime?: string | null
): number {
  const start = parseDate(startDate);
  const end = parseDate(endDate);

  if (startDate === endDate && startTime && endTime) {
    if (isWeekend(start) || isHoliday(start, holidays)) {
      return 0;
    }

    const startMinutes = parseTimeToMinutes(startTime);
    const endMinutes = parseTimeToMinutes(endTime);
    if (startMinutes === null || endMinutes === null) {
      return 0;
    }
    const diffMinutes = Math.max(0, endMinutes - startMinutes);
    return Math.max(0, Math.round((diffMinutes / 60) * 100) / 100);
  }
  
  let workingDays = 0;
  let currentDate = new Date(start);
  
  while (currentDate <= end) {
    if (!isWeekend(currentDate) && !isHoliday(currentDate, holidays)) {
      workingDays += 1;
    }
    currentDate = addDays(currentDate, 1);
  }
  
  // Adjust for half-days
  if (isHalfDayStart && workingDays > 0) {
    workingDays -= 0.5;
  }
  if (isHalfDayEnd && workingDays > 0) {
    workingDays -= 0.5;
  }
  
  const workingHours = workingDays * HOURS_PER_WORKDAY;

  return Math.max(0, workingHours);
}

export function datesOverlap(
  start1: string,
  end1: string,
  start2: string,
  end2: string
): boolean {
  const s1 = parseDate(start1);
  const e1 = parseDate(end1);
  const s2 = parseDate(start2);
  const e2 = parseDate(end2);
  
  return s1 <= e2 && s2 <= e1;
}
