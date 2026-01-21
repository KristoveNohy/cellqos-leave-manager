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

export function computeWorkingDays(
  startDate: string,
  endDate: string,
  isHalfDayStart: boolean,
  isHalfDayEnd: boolean,
  holidays: Set<string>
): number {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  
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
  
  return Math.max(0, workingDays);
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
