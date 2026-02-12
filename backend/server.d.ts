import "dotenv/config";
import type { UserRole } from "./shared/types";
type AuthUser = {
    userID: string;
    role: UserRole;
    email?: string;
    name?: string;
};
declare global {
    namespace Express {
        interface Request {
            auth?: AuthUser | null;
        }
    }
}
export {};
