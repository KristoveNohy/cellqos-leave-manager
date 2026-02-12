import type { UserRole } from "./types";
type AuthData = {
    userID: string;
    role: UserRole;
};
export declare function isAdmin(userRole: UserRole | undefined): boolean;
export declare function isManager(userRole: UserRole | undefined): boolean;
export declare function isManagerOrAdmin(userRole: UserRole | undefined): boolean;
export declare function requireAuth(auth?: AuthData | null): AuthData;
export declare function requireManager(userRole: UserRole | undefined): void;
export declare function requireAdmin(userRole: UserRole | undefined): void;
export declare function canEditRequest(requestUserId: string, requestStatus: string, currentUserId: string, currentUserRole: UserRole, isSameTeam: boolean): boolean;
export {};
