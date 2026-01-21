import { createHash } from "crypto";
import { api, APIError } from "encore.dev/api";
import db from "../db";
import { signAuthToken } from "./jwt";
import type { UserRole } from "../shared/types";

interface MagicLinkVerifyRequest {
  token: string;
}

interface MagicLinkVerifyResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
  };
}

export const verifyMagicLink = api(
  { auth: false, expose: true, method: "POST", path: "/auth/magic-link/verify" },
  async (req: MagicLinkVerifyRequest): Promise<MagicLinkVerifyResponse> => {
    const tokenHash = createHash("sha256").update(req.token).digest("hex");

    const user = await db.queryRow<{
      id: string;
      email: string;
      name: string;
      role: UserRole;
    }>`
      SELECT id, email, name, role
      FROM users
      WHERE magic_link_token_hash = ${tokenHash}
        AND magic_link_expires_at IS NOT NULL
        AND magic_link_expires_at > NOW()
    `;

    if (!user) {
      throw APIError.unauthenticated("Invalid or expired magic link");
    }

    await db.exec`
      UPDATE users
      SET magic_link_token_hash = NULL,
          magic_link_expires_at = NULL
      WHERE id = ${user.id}
    `;

    const token = signAuthToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });

    return { token, user };
  }
);
