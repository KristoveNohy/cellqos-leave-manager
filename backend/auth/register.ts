import { randomUUID } from "crypto";
import { api, APIError } from "encore.dev/api";
import db from "../db";
import { signAuthToken } from "./jwt";
import { validateEmail } from "../shared/validation";
import type { UserRole } from "../shared/types";

interface RegisterRequest {
  email: string;
  name: string;
  password: string;
  teamId?: number | null;
}

interface RegisterResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
  };
}

export const register = api(
  { auth: false, expose: true, method: "POST", path: "/auth/register" },
  async (req: RegisterRequest): Promise<RegisterResponse> => {
    validateEmail(req.email);
    const existing = await db.queryRow<{ id: string }>`
      SELECT id FROM users WHERE email = ${req.email}
    `;

    if (existing) {
      throw APIError.alreadyExists("User already exists");
    }

    const userId = randomUUID();
    const role: UserRole = "EMPLOYEE";

    const user = await db.queryRow<{
      id: string;
      email: string;
      name: string;
      role: UserRole;
    }>`
      INSERT INTO users (id, email, name, role, team_id, password_hash)
      VALUES (
        ${userId},
        ${req.email},
        ${req.name},
        ${role},
        ${req.teamId ?? null},
        crypt(${req.password}, gen_salt('bf'))
      )
      RETURNING id, email, name, role
    `;

    const token = signAuthToken({
      sub: user!.id,
      email: user!.email,
      role: user!.role,
      name: user!.name,
    });

    return { token, user: user! };
  }
);
