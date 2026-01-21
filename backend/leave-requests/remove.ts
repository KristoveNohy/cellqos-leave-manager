import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";
import { createAuditLog } from "../shared/audit";

interface DeleteLeaveRequestParams {
  id: number;
}

// Deletes a leave request (manager only)
export const remove = api(
  { auth: true, expose: true, method: "DELETE", path: "/leave-requests/:id" },
  async ({ id }: DeleteLeaveRequestParams): Promise<void> => {
    const auth = getAuthData()!;
    if (auth.role !== "MANAGER") {
      throw APIError.permissionDenied("Employees cannot delete requests; use cancel.");
    }
    const request = await db.queryRow`
      SELECT * FROM leave_requests WHERE id = ${id}
    `;
    
    if (!request) {
      throw APIError.notFound("Leave request not found");
    }
    
    const actorId = auth.userID;
    
    await db.exec`DELETE FROM leave_requests WHERE id = ${id}`;
    
    await createAuditLog(
      actorId,
      "leave_request",
      id,
      "DELETE",
      request,
      null
    );
  }
);
