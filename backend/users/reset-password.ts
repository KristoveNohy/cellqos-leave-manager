import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";
import { createAuditLog, createNotification } from "../shared/audit";
import { requireAdmin } from "../shared/rbac";

interface ResetPasswordRequest {
  id: string;
}

interface ResetPasswordResponse {
  ok: true;
}

export const resetPassword = api(
  { auth: true, expose: true, method: "POST", path: "/users/:id/reset-password" },
  async (req: ResetPasswordRequest): Promise<ResetPasswordResponse> => {
    const auth = getAuthData()!;
    requireAdmin(auth.role);

    const targetUser = await db.queryRow<{ id: string; name: string; email: string }>`
      SELECT id, name, email
      FROM users
      WHERE id = ${req.id}
    `;

    if (!targetUser) {
      throw APIError.notFound("User not found");
    }

    const defaultPassword = "Password123!";

    await db.exec`
      UPDATE users
      SET password_hash = crypt(${defaultPassword}, gen_salt('bf')),
          must_change_password = true
      WHERE id = ${req.id}
    `;

    const adminUser = await db.queryRow<{ name: string; email: string }>`
      SELECT name, email
      FROM users
      WHERE id = ${auth.userID}
    `;

    await createAuditLog(auth.userID, "users", req.id, "RESET_PASSWORD", null, {
      mustChangePassword: true,
    });

    await createNotification(targetUser.id, "PASSWORD_RESET", {
      adminName: adminUser?.name ?? "Admin",
      adminEmail: adminUser?.email ?? null,
      userName: targetUser.name,
      userEmail: targetUser.email,
    });

    return { ok: true };
  }
);
