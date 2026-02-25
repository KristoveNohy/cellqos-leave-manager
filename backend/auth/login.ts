import { api, APIError } from "encore.dev/api";
import db from "../db";
import { signAuthToken } from "./jwt";
import type { UserRole } from "../shared/types";
import bcrypt from "bcryptjs";

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
      passwordHash: string | null;
    }>`
      SELECT id, email, name, role,
        must_change_password as "mustChangePassword",
        password_hash as "passwordHash"
      FROM users
      WHERE email = ${req.email}
        AND is_active = true
        AND password_hash IS NOT NULL
    `;

    if (!user || !user.passwordHash || !(await bcrypt.compare(req.password, user.passwordHash))) {
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
