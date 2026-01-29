export interface NotificationEmailContent {
  subject: string;
  text: string;
}

const leaveTypeLabels: Record<string, string> = {
  ANNUAL_LEAVE: "Dovolenka",
  SICK_LEAVE: "PN",
  HOME_OFFICE: "Home office",
  UNPAID_LEAVE: "Neplatené voľno",
  OTHER: "Iné",
};

const leaveStatusLabels: Record<string, string> = {
  DRAFT: "Návrh",
  PENDING: "Čaká",
  APPROVED: "Schválené",
  REJECTED: "Zamietnuté",
  CANCELLED: "Zrušené",
};

function formatDateTime(date?: string, time?: string): string {
  if (!date) {
    return "?";
  }
  if (!time) {
    return date;
  }
  return `${date} ${time}`;
}

function formatTimeRange(startTime?: string | null, endTime?: string | null): string | null {
  if (!startTime && !endTime) {
    return null;
  }
  return `${startTime ?? "?"} – ${endTime ?? "?"}`;
}

function buildLeaveRequestDetails(payload: any): string[] {
  const startDateTime = formatDateTime(payload.startDate, payload.startTime);
  const endDateTime = formatDateTime(payload.endDate, payload.endTime);
  const timeRange = formatTimeRange(payload.startTime, payload.endTime);
  const typeLabel = payload.type ? leaveTypeLabels[payload.type] ?? payload.type : null;
  const statusLabel = payload.status ? leaveStatusLabels[payload.status] ?? payload.status : null;

  const lines = [
    `Typ: ${typeLabel ?? "?"}`,
    `Stav: ${statusLabel ?? "?"}`,
    `Začiatok: ${startDateTime}`,
    `Koniec: ${endDateTime}`,
  ];

  if (timeRange) {
    lines.push(`Čas: ${timeRange}`);
  }

  if (payload.computedHours !== undefined && payload.computedHours !== null) {
    lines.push(`Trvanie: ${payload.computedHours} hodín`);
  }

  if (payload.managerComment) {
    lines.push(`Komentár manažéra: ${payload.managerComment}`);
  }

  if (payload.userName || payload.userId) {
    lines.push(`Žiadateľ: ${payload.userName ?? payload.userId}`);
  }

  return lines;
}

export function buildNotificationEmail(type: string, payload: any): NotificationEmailContent {
  const safePayload = payload ?? {};

  switch (type) {
    case "NEW_PENDING_REQUEST":
      return {
        subject: "Nová žiadosť na schválenie",
        text: [
          "Bola vytvorená nová žiadosť na schválenie.",
          ...buildLeaveRequestDetails(safePayload),
        ].join("\n"),
      };
    case "REQUEST_APPROVED":
      return {
        subject: "Žiadosť schválená",
        text: [
          "Vaša žiadosť bola schválená.",
          ...buildLeaveRequestDetails(safePayload),
        ].join("\n"),
      };
    case "REQUEST_REJECTED":
      return {
        subject: "Žiadosť zamietnutá",
        text: [
          "Vaša žiadosť bola zamietnutá.",
          ...buildLeaveRequestDetails(safePayload),
        ].join("\n"),
      };
    case "REQUEST_UPDATED_BY_MANAGER":
      return {
        subject: "Žiadosť upravená manažérom",
        text: [
          "Vaša žiadosť bola upravená manažérom.",
          ...buildLeaveRequestDetails(safePayload),
        ].join("\n"),
      };
    case "REQUEST_CANCELLED":
      return {
        subject: "Žiadosť zrušená",
        text: [
          "Žiadosť bola zrušená.",
          ...buildLeaveRequestDetails(safePayload),
        ].join("\n"),
      };
    case "PASSWORD_RESET":
      return {
        subject: "Heslo bolo resetované",
        text: `Reset vykonal ${safePayload.adminName ?? "admin"}${
          safePayload.adminEmail ? ` (${safePayload.adminEmail})` : ""
        }.`,
      };
    default:
      return {
        subject: "Notifikácia",
        text: `Máte nové upozornenie.\n\nDetaily:\n${JSON.stringify(safePayload, null, 2)}`,
      };
  }
}
