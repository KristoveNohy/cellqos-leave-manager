import { api, APIError } from "encore.dev/api";
import db from "../db";
import { signAuthToken } from "./jwt";
import type { UserRole } from "../shared/types";

interface LoginRequest {
  email: string;
  password: string;
}

interface LoginResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    mustChangePassword: boolean;
  };
}

export const login = api(
  { auth: false, expose: true, method: "POST", path: "/auth/login" },
  async (req: LoginRequest): Promise<LoginResponse> => {
    const user = await db.queryRow<{
      id: string;
      email: string;
      name: string;
      role: UserRole;
      mustChangePassword: boolean;
    }>`
      SELECT id, email, name, role, must_change_password as "mustChangePassword"
      FROM users
      WHERE email = ${req.email}
        AND is_active = true
        AND password_hash IS NOT NULL
        AND password_hash = crypt(${req.password}, password_hash)
    `;

    if (!user) {
      throw APIError.unauthenticated("Invalid email or password");
    }

    const token = signAuthToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });

    return { token, user };
  }
);
