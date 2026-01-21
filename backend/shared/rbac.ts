import type { UserRole } from "./types";
import { HttpError } from "./http-error";

type AuthData = {
  userID: string;
  role: UserRole;
};

export function requireAuth(auth?: AuthData | null): AuthData {
  if (!auth) {
    throw new HttpError(401, "Authentication required");
  }
  return auth;
}

export function requireManager(userRole: UserRole | undefined): void {
  if (userRole !== "MANAGER") {
    throw new HttpError(403, "This action requires manager role");
  }
}

export function canEditRequest(
  requestUserId: string,
  requestStatus: string,
  currentUserId: string,
  currentUserRole: UserRole
): boolean {
  // Manager can edit anything
  if (currentUserRole === "MANAGER") {
    return true;
  }
  
  // Employee can only edit their own requests
  if (requestUserId !== currentUserId) {
    return false;
  }
  
  // Employee can only edit DRAFT or PENDING requests
  return requestStatus === "DRAFT" || requestStatus === "PENDING";
}
