import db from "../db";

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
  await db.exec`
    INSERT INTO notifications (user_id, type, payload_json, dedupe_key)
    VALUES (${userId}, ${type}, ${JSON.stringify(payload)}, ${dedupeKey ?? null})
    ON CONFLICT (dedupe_key) DO NOTHING
  `;
}
