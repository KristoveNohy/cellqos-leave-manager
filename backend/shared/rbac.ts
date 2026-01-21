import { APIError } from "encore.dev/api";
import type { UserRole } from "./types";

// Temporary: Get current user from request header
// This will be replaced with Clerk authentication
export function getCurrentUserId(headers?: Record<string, string>): string | null {
  // Placeholder: In production, this will use Clerk's authentication
  // For now, accept user ID from X-User-Id header for development
  return headers?.["x-user-id"] || null;
}

export function requireManager(userRole: UserRole | undefined): void {
  if (userRole !== "MANAGER") {
    throw APIError.permissionDenied("This action requires manager role");
  }
}

export function requireUser(userId: string | null): string {
  if (!userId) {
    throw APIError.unauthenticated("Authentication required");
  }
  return userId;
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
