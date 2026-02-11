import db from "../db";
import { sendNotificationEmail } from "./email";
import { buildNotificationEmail } from "./notification-email";
let notificationsDedupeKeySupported = null;
async function hasNotificationsDedupeKey() {
    if (notificationsDedupeKeySupported !== null) {
        return notificationsDedupeKeySupported;
    }
    const row = await db.queryRow `
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
export async function createAuditLog(actorUserId, entityType, entityId, action, beforeData = null, afterData = null) {
    await db.exec `
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
export async function createNotification(userId, type, payload, dedupeKey) {
    const supportsDedupeKey = await hasNotificationsDedupeKey();
    let notificationId = null;
    if (supportsDedupeKey) {
        const inserted = await db.queryRow `
      INSERT INTO notifications (user_id, type, payload_json, dedupe_key)
      VALUES (${userId}, ${type}, ${JSON.stringify(payload)}, ${dedupeKey ?? null})
      ON CONFLICT (dedupe_key) DO NOTHING
      RETURNING id
    `;
        notificationId = inserted?.id ?? null;
    }
    else {
        const inserted = await db.queryRow `
      INSERT INTO notifications (user_id, type, payload_json)
      VALUES (${userId}, ${type}, ${JSON.stringify(payload)})
      RETURNING id
    `;
        notificationId = inserted?.id ?? null;
    }
    if (!notificationId) {
        return;
    }
    const user = await db.queryRow `
    SELECT email
    FROM users
    WHERE id = ${userId}
  `;
    if (!user?.email) {
        return;
    }
    const { subject, text } = buildNotificationEmail(type, payload);
    const sent = await sendNotificationEmail({
        to: user.email,
        subject,
        text,
    });
    if (sent) {
        await db.exec `
      UPDATE notifications
      SET sent_at = NOW()
      WHERE id = ${notificationId}
    `;
    }
}
//# sourceMappingURL=audit.js.map