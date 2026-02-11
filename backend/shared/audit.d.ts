export declare function createAuditLog(actorUserId: string, entityType: string, entityId: string | number, action: string, beforeData?: any, afterData?: any): Promise<void>;
export declare function createNotification(userId: string, type: string, payload: any, dedupeKey?: string | null): Promise<void>;
