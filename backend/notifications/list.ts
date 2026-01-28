import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";
import { isAdmin } from "../shared/rbac";
import type { Notification } from "../shared/types";

interface ListNotificationsResponse {
  notifications: Notification[];
}

let notificationsDedupeKeySupported: boolean | null = null;

async function hasNotificationsDedupeKey(): Promise<boolean> {
  if (notificationsDedupeKeySupported !== null) {
    return notificationsDedupeKeySupported;
  }
  const row = await db.queryRow<{ exists: boolean }>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'notifications'
        AND column_name = 'dedupe_key'
    ) as "exists"
  `;
  notificationsDedupeKeySupported = row?.exists ?? false;
  return notificationsDedupeKeySupported;
}

export const list = api(
  { auth: true, expose: true, method: "GET", path: "/notifications" },
  async (): Promise<ListNotificationsResponse> => {
    const auth = getAuthData()!;
    const notifications: Notification[] = [];
    const supportsDedupeKey = await hasNotificationsDedupeKey();
    const dedupeSelect = supportsDedupeKey ? `, dedupe_key as "dedupeKey"` : "";
    const isAdminUser = isAdmin(auth.role);
    const whereClause = isAdminUser ? "" : "WHERE user_id = $1";
    const params = isAdminUser ? [] : [auth.userID];

    for await (const row of db.rawQuery<Notification>(
      `
        SELECT 
          id,
          user_id as "userId",
          type,
          payload_json as "payloadJson",
          sent_at as "sentAt",
          read_at as "readAt",
          created_at as "createdAt"
          ${dedupeSelect}
        FROM notifications
        ${whereClause}
        ORDER BY (read_at IS NULL) DESC, created_at DESC
        LIMIT 50
      `,
      ...params
    )) {
      notifications.push(row);
    }

    return { notifications };
  }
);
