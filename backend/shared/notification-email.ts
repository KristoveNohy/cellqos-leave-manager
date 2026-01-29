export interface NotificationEmailContent {
  subject: string;
  text: string;
}

export function buildNotificationEmail(type: string, payload: any): NotificationEmailContent {
  const safePayload = payload ?? {};
  const startDate = safePayload.startDate ?? "?";
  const endDate = safePayload.endDate ?? "?";
  const range = `${startDate} – ${endDate}`;

  switch (type) {
    case "NEW_PENDING_REQUEST":
      return {
        subject: "Nová žiadosť na schválenie",
        text: `${safePayload.userName ?? safePayload.userId ?? "Neznámy používateľ"} • ${range}`,
      };
    case "REQUEST_APPROVED":
      return {
        subject: "Žiadosť schválená",
        text: range,
      };
    case "REQUEST_REJECTED":
      return {
        subject: "Žiadosť zamietnutá",
        text: range,
      };
    case "REQUEST_UPDATED_BY_MANAGER":
      return {
        subject: "Žiadosť upravená manažérom",
        text: `Stav: ${safePayload.status ?? "nezmenený"} • ${range}`,
      };
    case "REQUEST_CANCELLED":
      return {
        subject: "Žiadosť zrušená",
        text: `${safePayload.userName ?? safePayload.userId ?? "Neznámy používateľ"} • ${range}`,
      };
    case "PASSWORD_RESET":
      return {
        subject: "Heslo bolo resetované",
        text: `Reset vykonal ${safePayload.adminName ?? "admin"}${
          safePayload.adminEmail ? ` (${safePayload.adminEmail})` : ""
        }`,
      };
    default:
      return {
        subject: "Notifikácia",
        text: JSON.stringify(safePayload),
      };
  }
}
