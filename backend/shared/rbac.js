import { HttpError } from "./http-error";
export function isAdmin(userRole) {
    return userRole === "ADMIN";
}
export function isManager(userRole) {
    return userRole === "MANAGER";
}
export function isManagerOrAdmin(userRole) {
    return userRole === "MANAGER" || userRole === "ADMIN";
}
export function requireAuth(auth) {
    if (!auth) {
        throw new HttpError(401, "Authentication required");
    }
    return auth;
}
export function requireManager(userRole) {
    if (!isManagerOrAdmin(userRole)) {
        throw new HttpError(403, "This action requires manager role");
    }
}
export function requireAdmin(userRole) {
    if (userRole !== "ADMIN") {
        throw new HttpError(403, "This action requires admin role");
    }
}
export function canEditRequest(requestUserId, requestStatus, currentUserId, currentUserRole, isSameTeam) {
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
//# sourceMappingURL=rbac.js.map