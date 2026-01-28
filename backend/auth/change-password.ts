import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";

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

    const updated = await db.queryRow<{ id: string }>`
      UPDATE users
      SET password_hash = crypt(${req.newPassword}, gen_salt('bf')),
          must_change_password = false
      WHERE id = ${auth.userID}
        AND password_hash IS NOT NULL
        AND password_hash = crypt(${req.currentPassword}, password_hash)
      RETURNING id
    `;

    if (!updated) {
      throw APIError.invalidArgument("Current password is incorrect");
    }

    return { ok: true };
  }
);
