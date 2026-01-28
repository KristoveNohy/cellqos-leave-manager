import { api, APIError, Query } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";
import { isAdmin, isManager } from "../shared/rbac";
import type { AuditLog } from "../shared/types";

interface ListAuditLogsParams {
  entityType?: Query<string>;
  entityId?: Query<string>;
  limit?: Query<number>;
}

interface ListAuditLogsResponse {
  logs: AuditLog[];
}

// Lists audit logs with optional filters (manager only)
export const list = api(
  { auth: true, expose: true, method: "GET", path: "/audit" },
  async (params: ListAuditLogsParams): Promise<ListAuditLogsResponse> => {
    const auth = getAuthData()!;
    const isAdminUser = isAdmin(auth.role);
    const isManagerUser = isManager(auth.role);
    if (!isAdminUser && !isManagerUser) {
      if (params.entityType !== "leave_request" || !params.entityId) {
        throw APIError.permissionDenied("Not allowed to view audit logs");
      }
      const requestId = Number(params.entityId);
      const owned = await db.queryRow<{ id: number }>`
        SELECT id
        FROM leave_requests
        WHERE id = ${requestId}
          AND user_id = ${auth.userID}
      `;
      if (!owned) {
        throw APIError.permissionDenied("Not allowed to view audit logs");
      }
    }

    if (isManagerUser && !isAdminUser && params.entityType === "leave_request" && params.entityId) {
      const requestId = Number(params.entityId);
      const request = await db.queryRow<{ teamId: number | null }>`
        SELECT u.team_id as "teamId"
        FROM leave_requests lr
        JOIN users u ON lr.user_id = u.id
        WHERE lr.id = ${requestId}
      `;
      const viewer = await db.queryRow<{ teamId: number | null }>`
        SELECT team_id as "teamId"
        FROM users
        WHERE id = ${auth.userID}
      `;
      if (!request || !viewer || viewer.teamId === null || viewer.teamId !== request.teamId) {
        throw APIError.permissionDenied("Not allowed to view audit logs");
      }
    }
    const conditions: string[] = ["1=1"];
    const values: any[] = [];
    
    if (params.entityType) {
      conditions.push(`entity_type = $${values.length + 1}`);
      values.push(params.entityType);
    }
    
    if (params.entityId) {
      conditions.push(`entity_id = $${values.length + 1}`);
      values.push(params.entityId);
    }
    
    const limit = params.limit || 100;
    
    const query = `
      SELECT 
        a.id,
        a.actor_user_id as "actorUserId",
        u.name as "actorName",
        a.entity_type as "entityType",
        a.entity_id as "entityId",
        a.action,
        a.before_json as "beforeJson",
        a.after_json as "afterJson",
        a.created_at as "createdAt"
      FROM audit_logs a
      LEFT JOIN users u ON a.actor_user_id = u.id
      WHERE ${conditions.join(" AND ")}
      ORDER BY a.created_at DESC
      LIMIT ${limit}
    `;
    
    const logs: AuditLog[] = [];
    for await (const row of db.rawQuery<AuditLog>(query, ...values)) {
      logs.push(row);
    }
    
    return { logs };
  }
);
