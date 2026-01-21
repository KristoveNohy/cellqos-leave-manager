import jwt from "jsonwebtoken";
import type { UserRole } from "../shared/types";

interface TokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  name: string;
}

export function signAuthToken(payload: TokenPayload, expiresIn = "7d"): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is required");
  }
  return jwt.sign(payload, secret, { expiresIn });
}
