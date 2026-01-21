import { api, Query } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";
import { requireManager } from "../shared/rbac";
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
    requireManager(auth.role);
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
        id,
        actor_user_id as "actorUserId",
        entity_type as "entityType",
        entity_id as "entityId",
        action,
        before_json as "beforeJson",
        after_json as "afterJson",
        created_at as "createdAt"
      FROM audit_logs
      WHERE ${conditions.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    
    const logs: AuditLog[] = [];
    for await (const row of db.rawQuery<AuditLog>(query, ...values)) {
      logs.push(row);
    }
    
    return { logs };
  }
);
