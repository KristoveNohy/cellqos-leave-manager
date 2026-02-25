import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";
import bcrypt from "bcryptjs";

interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

interface ChangePasswordResponse {
  ok: true;
}

export const changePassword = api(
  { auth: true, expose: true, method: "POST", path: "/auth/change-password" },
  async (req: ChangePasswordRequest): Promise<ChangePasswordResponse> => {
    if (!req.currentPassword || !req.newPassword) {
      throw APIError.invalidArgument("Current and new password are required");
    }

    const auth = getAuthData()!;

    const existing = await db.queryRow<{ passwordHash: string | null }>`
      SELECT password_hash as "passwordHash"
      FROM users
      WHERE id = ${auth.userID}
        AND password_hash IS NOT NULL
    `;

    if (!existing?.passwordHash || !(await bcrypt.compare(req.currentPassword, existing.passwordHash))) {
      throw APIError.invalidArgument("Current password is incorrect");
    }

    const newHash = await bcrypt.hash(req.newPassword, 10);
    await db.exec`
      UPDATE users
      SET password_hash = ${newHash},
          must_change_password = false
      WHERE id = ${auth.userID}
    `;

    return { ok: true };
  }
);
