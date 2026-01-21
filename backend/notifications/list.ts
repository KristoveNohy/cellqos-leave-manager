import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";
import type { Notification } from "../shared/types";

interface ListNotificationsResponse {
  notifications: Notification[];
}

export const list = api(
  { auth: true, expose: true, method: "GET", path: "/notifications" },
  async (): Promise<ListNotificationsResponse> => {
    const auth = getAuthData()!;
    const notifications: Notification[] = [];

    for await (const row of db.rawQuery<Notification>(
      `
        SELECT 
          id,
          user_id as "userId",
          type,
          payload_json as "payloadJson",
          sent_at as "sentAt",
          read_at as "readAt",
          created_at as "createdAt",
          dedupe_key as "dedupeKey"
        FROM notifications
        WHERE user_id = $1
        ORDER BY (read_at IS NULL) DESC, created_at DESC
        LIMIT 50
      `,
      auth.userID
    )) {
      notifications.push(row);
    }

    return { notifications };
  }
);
