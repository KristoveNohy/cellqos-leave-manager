function normalizeDate(value?: string | null): string {
  if (!value) {
    return "";
  }
  return value.slice(0, 10);
}

function extractTime(value?: string | null): string | null {
  if (!value) {
    return null;
  }
  const match = value.match(/(\d{2}):(\d{2})/);
  if (!match) {
    return null;
  }
  return `${match[1]}:${match[2]}`;
}

export function formatRequestDateTime(date?: string | null, time?: string | null): string {
  const datePart = normalizeDate(date);
  if (!datePart) {
    return "";
  }
  const timePart = extractTime(time);
  return timePart ? `${datePart} ${timePart}` : datePart;
}

export function formatRequestRange(payload: {
  startDate?: string | null;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
}): string {
  const start = formatRequestDateTime(payload.startDate, payload.startTime);
  const end = formatRequestDateTime(payload.endDate, payload.endTime);
  if (!start && !end) {
    return "";
  }
  if (!start) {
    return end;
  }
  if (!end) {
    return start;
  }
  return `${start} – ${end}`;
}
