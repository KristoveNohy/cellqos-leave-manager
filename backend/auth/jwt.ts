import jwt from "jsonwebtoken";
import { secret } from "encore.dev/config";
import type { UserRole } from "../shared/types";

const jwtSecret = secret("JwtSecret");

interface TokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  name: string;
}

export function signAuthToken(payload: TokenPayload, expiresIn = "7d"): string {
  return jwt.sign(payload, jwtSecret(), { expiresIn });
}
