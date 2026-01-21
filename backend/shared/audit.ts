import db from "../db";

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

export async function createAuditLog(
  actorUserId: string,
  entityType: string,
  entityId: string | number,
  action: string,
  beforeData: any = null,
  afterData: any = null
): Promise<void> {
  await db.exec`
    INSERT INTO audit_logs (
      actor_user_id, entity_type, entity_id, action, before_json, after_json
    ) VALUES (
      ${actorUserId},
      ${entityType},
      ${String(entityId)},
      ${action},
      ${beforeData ? JSON.stringify(beforeData) : null},
      ${afterData ? JSON.stringify(afterData) : null}
    )
  `;
}

export async function createNotification(
  userId: string,
  type: string,
  payload: any,
  dedupeKey?: string | null
): Promise<void> {
  const supportsDedupeKey = await hasNotificationsDedupeKey();
  if (supportsDedupeKey) {
    await db.exec`
      INSERT INTO notifications (user_id, type, payload_json, dedupe_key)
      VALUES (${userId}, ${type}, ${JSON.stringify(payload)}, ${dedupeKey ?? null})
      ON CONFLICT (dedupe_key) DO NOTHING
    `;
    return;
  }
  await db.exec`
    INSERT INTO notifications (user_id, type, payload_json, dedupe_key)
    VALUES (${userId}, ${type}, ${JSON.stringify(payload)}, ${dedupeKey ?? null})
    ON CONFLICT (dedupe_key) DO NOTHING
  `;
}
