import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";

export const readAll = api(
  { auth: true, expose: true, method: "POST", path: "/notifications/read-all" },
  async (): Promise<{ ok: true }> => {
    const auth = getAuthData()!;
    await db.exec`
      UPDATE notifications
      SET read_at = NOW()
      WHERE user_id = ${auth.userID}
        AND read_at IS NULL
    `;
    return { ok: true };
  }
);
