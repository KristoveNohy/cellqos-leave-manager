import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";
import { isAdmin } from "../shared/rbac";

export const readAll = api(
  { auth: true, expose: true, method: "POST", path: "/notifications/read-all" },
  async (): Promise<{ ok: true }> => {
    const auth = getAuthData()!;
    if (isAdmin(auth.role)) {
      await db.exec`
        UPDATE notifications
        SET read_at = NOW()
        WHERE read_at IS NULL
      `;
    } else {
      await db.exec`
        UPDATE notifications
        SET read_at = NOW()
        WHERE user_id = ${auth.userID}
          AND read_at IS NULL
      `;
    }
    return { ok: true };
  }
);
