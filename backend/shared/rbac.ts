import type { UserRole } from "./types";
import { HttpError } from "./http-error";

type AuthData = {
  userID: string;
  role: UserRole;
};

export function isAdmin(userRole: UserRole | undefined): boolean {
  return userRole === "ADMIN";
}

export function isManager(userRole: UserRole | undefined): boolean {
  return userRole === "MANAGER";
}

export function isManagerOrAdmin(userRole: UserRole | undefined): boolean {
  return userRole === "MANAGER" || userRole === "ADMIN";
}

export function requireAuth(auth?: AuthData | null): AuthData {
  if (!auth) {
    throw new HttpError(401, "Authentication required");
  }
  return auth;
}

export function requireManager(userRole: UserRole | undefined): void {
  if (!isManagerOrAdmin(userRole)) {
    throw new HttpError(403, "This action requires manager role");
  }
}

export function requireAdmin(userRole: UserRole | undefined): void {
  if (userRole !== "ADMIN") {
    throw new HttpError(403, "This action requires admin role");
  }
}

export function canEditRequest(
  requestUserId: string,
  requestStatus: string,
  currentUserId: string,
  currentUserRole: UserRole,
  isSameTeam: boolean
): boolean {
  if (currentUserRole === "ADMIN") {
    return true;
  }

  // Manager can edit requests in their team
  if (currentUserRole === "MANAGER") {
    return isSameTeam;
  }
  
  // Employee can only edit their own requests
  if (requestUserId !== currentUserId) {
    return false;
  }
  
  // Employee can only edit DRAFT or PENDING requests
  return requestStatus === "DRAFT" || requestStatus === "PENDING";
}
