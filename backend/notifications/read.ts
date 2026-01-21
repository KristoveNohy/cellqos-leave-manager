import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";

interface ReadNotificationParams {
  id: number;
}

export const read = api(
  { auth: true, expose: true, method: "POST", path: "/notifications/:id/read" },
  async ({ id }: ReadNotificationParams): Promise<{ ok: true }> => {
    const auth = getAuthData()!;
    await db.exec`
      UPDATE notifications
      SET read_at = NOW()
      WHERE id = ${id}
        AND user_id = ${auth.userID}
    `;
    return { ok: true };
  }
);
