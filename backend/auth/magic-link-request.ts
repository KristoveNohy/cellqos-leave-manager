import { randomBytes, createHash } from "crypto";
import { api } from "encore.dev/api";
import db from "../db";

interface MagicLinkRequest {
  email: string;
  redirectUrl?: string;
}

interface MagicLinkResponse {
  ok: boolean;
  magicLinkToken?: string;
  magicLinkUrl?: string;
}

export const requestMagicLink = api(
  { auth: false, expose: true, method: "POST", path: "/auth/magic-link" },
  async (req: MagicLinkRequest): Promise<MagicLinkResponse> => {
    const user = await db.queryRow<{ id: string }>`
      SELECT id FROM users WHERE email = ${req.email} AND is_active = true
    `;

    if (!user) {
      return { ok: true };
    }

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");

    await db.exec`
      UPDATE users
      SET magic_link_token_hash = ${tokenHash},
          magic_link_expires_at = NOW() + INTERVAL '15 minutes'
      WHERE id = ${user.id}
    `;

    const magicLinkUrl = req.redirectUrl
      ? `${req.redirectUrl}?token=${token}`
      : undefined;

    return {
      ok: true,
      magicLinkToken: token,
      magicLinkUrl,
    };
  }
);
