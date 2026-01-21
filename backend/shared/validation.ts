import { parseDate } from "./date-utils";
import { HttpError } from "./http-error";

export function validateDateRange(startDate: string, endDate: string): void {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  
  if (end < start) {
    throw new HttpError(400, "End date must be after or equal to start date");
  }
}

export function validateNotInPast(date: string): void {
  const requestDate = parseDate(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (requestDate < today) {
    throw new HttpError(400, "Cannot create requests in the past");
  }
}

export function validateEmail(email: string): void {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new HttpError(400, "Invalid email format");
  }
}
