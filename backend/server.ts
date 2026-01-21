import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import { Pool } from "pg";
import jwt from "jsonwebtoken";
import { randomBytes, createHash, randomUUID } from "crypto";
import { computeWorkingDays } from "./shared/date-utils";
import { validateDateRange, validateNotInPast, validateEmail } from "./shared/validation";
import { canEditRequest, requireManager, requireAuth } from "./shared/rbac";
import type { LeaveRequest, LeaveStatus, LeaveType, Team, User, Holiday, UserRole, AuditLog } from "./shared/types";
import { HttpError } from "./shared/http-error";

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  throw new Error("JWT_SECRET is required");
}

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

type AuthUser = {
  userID: string;
  email: string;
  role: UserRole;
  name: string;
};

declare module "express-serve-static-core" {
  interface Request {
    auth?: AuthUser | null;
  }
}

const asyncHandler = (handler: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };

app.use((req, _res, next) => {
  const header = req.headers.authorization;
  if (!header) {
    req.auth = null;
    return next();
  }

  const token = header.replace("Bearer ", "");
  try {
    const payload = jwt.verify(token, jwtSecret) as AuthUser & { sub: string };
    req.auth = {
      userID: payload.sub,
      email: payload.email,
      role: payload.role,
      name: payload.name,
    };
  } catch {
    req.auth = null;
  }

  return next();
});

function signAuthToken(payload: { sub: string; email: string; role: UserRole; name: string }, expiresIn = "7d") {
  return jwt.sign(payload, jwtSecret, { expiresIn });
}

async function queryRow<T>(text: string, values: any[] = []): Promise<T | null> {
  const result = await pool.query<T>(text, values);
  return result.rows[0] ?? null;
}

async function queryRows<T>(text: string, values: any[] = []): Promise<T[]> {
  const result = await pool.query<T>(text, values);
  return result.rows;
}

app.post("/auth/login", asyncHandler(async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };
  const user = await queryRow<{ id: string; email: string; name: string; role: UserRole }>(
    `
      SELECT id, email, name, role
      FROM users
      WHERE email = $1
        AND is_active = true
        AND password_hash IS NOT NULL
        AND password_hash = crypt($2, password_hash)
    `,
    [email, password]
  );

  if (!user) {
    throw new HttpError(401, "Invalid email or password");
  }

  const token = signAuthToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
  });

  res.json({ token, user });
}));

app.post("/auth/register", asyncHandler(async (req, res) => {
  const { email, name, password, teamId } = req.body as { email: string; name: string; password: string; teamId?: number | null };
  validateEmail(email);

  const existing = await queryRow<{ id: string }>("SELECT id FROM users WHERE email = $1", [email]);
  if (existing) {
    throw new HttpError(409, "User already exists");
  }

  const userId = randomUUID();
  const role: UserRole = "EMPLOYEE";

  const user = await queryRow<{ id: string; email: string; name: string; role: UserRole }>(
    `
      INSERT INTO users (id, email, name, role, team_id, password_hash)
      VALUES ($1, $2, $3, $4, $5, crypt($6, gen_salt('bf')))
      RETURNING id, email, name, role
    `,
    [userId, email, name, role, teamId ?? null, password]
  );

  if (!user) {
    throw new HttpError(500, "Registration failed");
  }

  const token = signAuthToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
  });

  res.json({ token, user });
}));

app.post("/auth/magic-link", asyncHandler(async (req, res) => {
  const { email, redirectUrl } = req.body as { email: string; redirectUrl?: string };
  const user = await queryRow<{ id: string }>(
    "SELECT id FROM users WHERE email = $1 AND is_active = true",
    [email]
  );

  if (!user) {
    return res.json({ ok: true });
  }

  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");

  await pool.query(
    `
      UPDATE users
      SET magic_link_token_hash = $1,
          magic_link_expires_at = NOW() + INTERVAL '15 minutes'
      WHERE id = $2
    `,
    [tokenHash, user.id]
  );

  const magicLinkUrl = redirectUrl ? `${redirectUrl}?token=${token}` : undefined;

  res.json({ ok: true, magicLinkToken: token, magicLinkUrl });
}));

app.post("/auth/magic-link/verify", asyncHandler(async (req, res) => {
  const { token } = req.body as { token: string };
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const user = await queryRow<{ id: string; email: string; name: string; role: UserRole }>(
    `
      SELECT id, email, name, role
      FROM users
      WHERE magic_link_token_hash = $1
        AND magic_link_expires_at IS NOT NULL
        AND magic_link_expires_at > NOW()
    `,
    [tokenHash]
  );

  if (!user) {
    throw new HttpError(401, "Invalid or expired magic link");
  }

  await pool.query(
    `
      UPDATE users
      SET magic_link_token_hash = NULL,
          magic_link_expires_at = NULL
      WHERE id = $1
    `,
    [user.id]
  );

  const authToken = signAuthToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
  });

  res.json({ token: authToken, user });
}));

app.get("/users/me", asyncHandler(async (req, res) => {
  const auth = requireAuth(req.auth ?? null);
  const user = await queryRow<User>(
    `
      SELECT id, email, name, role,
        team_id as "teamId",
        is_active as "isActive",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM users
      WHERE id = $1
    `,
    [auth.userID]
  );

  if (!user) {
    throw new HttpError(404, "User not found");
  }

  res.json(user);
}));

app.get("/users", asyncHandler(async (req, res) => {
  const auth = requireAuth(req.auth ?? null);
  requireManager(auth.role);

  const users = await queryRows<User>(
    `
      SELECT id, email, name, role,
        team_id as "teamId",
        is_active as "isActive",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM users
      WHERE is_active = true
      ORDER BY name ASC
    `
  );

  res.json({ users });
}));

app.get("/teams", asyncHandler(async (req, res) => {
  requireAuth(req.auth ?? null);

  const teams = await queryRows<Team>(
    `
      SELECT id, name,
        max_concurrent_leaves as "maxConcurrentLeaves",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM teams
      ORDER BY name ASC
    `
  );

  res.json({ teams });
}));

app.get("/holidays", asyncHandler(async (req, res) => {
  requireAuth(req.auth ?? null);
  const year = req.query.year ? Number(req.query.year) : undefined;

  let holidays: Holiday[] = [];

  if (year) {
    holidays = await queryRows<Holiday>(
      `
        SELECT id, date::text as date, name,
          is_company_holiday as "isCompanyHoliday",
          created_at as "createdAt"
        FROM holidays
        WHERE EXTRACT(YEAR FROM date) = $1
        ORDER BY date ASC
      `,
      [year]
    );
  } else {
    holidays = await queryRows<Holiday>(
      `
        SELECT id, date::text as date, name,
          is_company_holiday as "isCompanyHoliday",
          created_at as "createdAt"
        FROM holidays
        ORDER BY date ASC
      `
    );
  }

  res.json({ holidays });
}));

app.get("/leave-requests", asyncHandler(async (req, res) => {
  const auth = requireAuth(req.auth ?? null);
  const isManager = auth.role === "MANAGER";
  const conditions: string[] = ["1=1"];
  const values: any[] = [];

  const userId = req.query.userId as string | undefined;
  const status = req.query.status as LeaveStatus | undefined;
  const type = req.query.type as LeaveType | undefined;
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;
  const teamId = req.query.teamId ? Number(req.query.teamId) : undefined;

  if (userId) {
    if (!isManager && userId !== auth.userID) {
      throw new HttpError(403, "Not allowed to view other users' requests");
    }
    conditions.push(`lr.user_id = $${values.length + 1}`);
    values.push(userId);
  }

  if (!isManager && !userId) {
    conditions.push(`lr.user_id = $${values.length + 1}`);
    values.push(auth.userID);
  }

  if (status) {
    conditions.push(`lr.status = $${values.length + 1}`);
    values.push(status);
  }

  if (type) {
    conditions.push(`lr.type = $${values.length + 1}`);
    values.push(type);
  }

  if (startDate) {
    conditions.push(`lr.end_date >= $${values.length + 1}`);
    values.push(startDate);
  }

  if (endDate) {
    conditions.push(`lr.start_date <= $${values.length + 1}`);
    values.push(endDate);
  }

  if (teamId) {
    conditions.push(`u.team_id = $${values.length + 1}`);
    values.push(teamId);
  }

  const query = `
      SELECT 
        lr.id, lr.user_id as "userId", lr.type,
        lr.start_date::text as "startDate",
        lr.end_date::text as "endDate",
        lr.is_half_day_start as "isHalfDayStart",
        lr.is_half_day_end as "isHalfDayEnd",
        lr.status, lr.reason, lr.manager_comment as "managerComment",
        lr.approved_by as "approvedBy",
        lr.approved_at as "approvedAt",
        lr.computed_days as "computedDays",
        lr.attachment_url as "attachmentUrl",
        lr.created_at as "createdAt",
        lr.updated_at as "updatedAt"
      FROM leave_requests lr
      LEFT JOIN users u ON lr.user_id = u.id
      WHERE ${conditions.join(" AND ")}
      ORDER BY lr.start_date DESC, lr.created_at DESC
    `;

  const requests = await queryRows<LeaveRequest>(query, values);
  res.json({ requests });
}));

app.post("/leave-requests", asyncHandler(async (req, res) => {
  const auth = requireAuth(req.auth ?? null);
  const { type, startDate, endDate, isHalfDayStart, isHalfDayEnd, reason } = req.body as {
    type: LeaveType;
    startDate: string;
    endDate: string;
    isHalfDayStart?: boolean;
    isHalfDayEnd?: boolean;
    reason?: string;
  };

  validateDateRange(startDate, endDate);
  validateNotInPast(startDate);

  const holidayRows = await queryRows<{ date: string }>(
    `
      SELECT date::text as date FROM holidays
      WHERE date >= $1 AND date <= $2
    `,
    [startDate, endDate]
  );

  const holidayDates = new Set(holidayRows.map((h) => h.date));
  const computedDays = computeWorkingDays(
    startDate,
    endDate,
    isHalfDayStart ?? false,
    isHalfDayEnd ?? false,
    holidayDates
  );

  const result = await queryRow<{ id: number }>(
    `
      INSERT INTO leave_requests (
        user_id, type, start_date, end_date,
        is_half_day_start, is_half_day_end,
        reason, computed_days, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'DRAFT')
      RETURNING id
    `,
    [auth.userID, type, startDate, endDate, isHalfDayStart ?? false, isHalfDayEnd ?? false, reason ?? null, computedDays]
  );

  const leaveRequest = await queryRow<LeaveRequest>(
    `
      SELECT 
        id, user_id as "userId", type,
        start_date::text as "startDate",
        end_date::text as "endDate",
        is_half_day_start as "isHalfDayStart",
        is_half_day_end as "isHalfDayEnd",
        status, reason, manager_comment as "managerComment",
        approved_by as "approvedBy",
        approved_at as "approvedAt",
        computed_days as "computedDays",
        attachment_url as "attachmentUrl",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM leave_requests
      WHERE id = $1
    `,
    [result?.id]
  );

  res.json(leaveRequest);
}));

app.patch("/leave-requests/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req.auth ?? null);
  const id = Number(req.params.id);
  const { type, startDate, endDate, isHalfDayStart, isHalfDayEnd, reason, managerComment } = req.body as {
    type?: LeaveType;
    startDate?: string;
    endDate?: string;
    isHalfDayStart?: boolean;
    isHalfDayEnd?: boolean;
    reason?: string;
    managerComment?: string;
  };

  const before = await queryRow<LeaveRequest>(
    `
      SELECT 
        id, user_id as "userId", type,
        start_date::text as "startDate",
        end_date::text as "endDate",
        is_half_day_start as "isHalfDayStart",
        is_half_day_end as "isHalfDayEnd",
        status, reason, manager_comment as "managerComment",
        approved_by as "approvedBy",
        approved_at as "approvedAt",
        computed_days as "computedDays",
        attachment_url as "attachmentUrl",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM leave_requests
      WHERE id = $1
    `,
    [id]
  );

  if (!before) {
    throw new HttpError(404, "Leave request not found");
  }

  if (!canEditRequest(before.userId, before.status, auth.userID, auth.role)) {
    throw new HttpError(403, "You are not allowed to edit this request");
  }

  const newStartDate = startDate ?? before.startDate;
  const newEndDate = endDate ?? before.endDate;

  if (startDate || endDate) {
    validateDateRange(newStartDate, newEndDate);
    validateNotInPast(newStartDate);

    const overlaps = await queryRow<{ count: number }>(
      `
        SELECT COUNT(*) as count
        FROM leave_requests
        WHERE user_id = $1
          AND id != $2
          AND status IN ('PENDING', 'APPROVED')
          AND start_date <= $3
          AND end_date >= $4
      `,
      [before.userId, id, newEndDate, newStartDate]
    );

    if (overlaps && overlaps.count > 0) {
      throw new HttpError(409, "Request overlaps with existing pending or approved request");
    }
  }

  let computedDays = before.computedDays;
  if (startDate || endDate || isHalfDayStart !== undefined || isHalfDayEnd !== undefined) {
    const holidayRows = await queryRows<{ date: string }>(
      `
        SELECT date::text as date FROM holidays
        WHERE date >= $1 AND date <= $2
      `,
      [newStartDate, newEndDate]
    );

    const holidayDates = new Set(holidayRows.map((h) => h.date));
    computedDays = computeWorkingDays(
      newStartDate,
      newEndDate,
      isHalfDayStart ?? before.isHalfDayStart,
      isHalfDayEnd ?? before.isHalfDayEnd,
      holidayDates
    );
  }

  const updates: string[] = [];
  const values: any[] = [];

  if (type !== undefined) {
    updates.push(`type = $${values.length + 1}`);
    values.push(type);
  }
  if (startDate !== undefined) {
    updates.push(`start_date = $${values.length + 1}`);
    values.push(startDate);
  }
  if (endDate !== undefined) {
    updates.push(`end_date = $${values.length + 1}`);
    values.push(endDate);
  }
  if (isHalfDayStart !== undefined) {
    updates.push(`is_half_day_start = $${values.length + 1}`);
    values.push(isHalfDayStart);
  }
  if (isHalfDayEnd !== undefined) {
    updates.push(`is_half_day_end = $${values.length + 1}`);
    values.push(isHalfDayEnd);
  }
  if (reason !== undefined) {
    updates.push(`reason = $${values.length + 1}`);
    values.push(reason || null);
  }
  if (managerComment !== undefined) {
    updates.push(`manager_comment = $${values.length + 1}`);
    values.push(managerComment || null);
  }
  if (computedDays !== before.computedDays) {
    updates.push(`computed_days = $${values.length + 1}`);
    values.push(computedDays);
  }

  if (updates.length > 0) {
    values.push(id);
    await pool.query(`UPDATE leave_requests SET ${updates.join(", ")} WHERE id = $${values.length}`, values);
  }

  const after = await queryRow<LeaveRequest>(
    `
      SELECT 
        id, user_id as "userId", type,
        start_date::text as "startDate",
        end_date::text as "endDate",
        is_half_day_start as "isHalfDayStart",
        is_half_day_end as "isHalfDayEnd",
        status, reason, manager_comment as "managerComment",
        approved_by as "approvedBy",
        approved_at as "approvedAt",
        computed_days as "computedDays",
        attachment_url as "attachmentUrl",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM leave_requests
      WHERE id = $1
    `,
    [id]
  );

  res.json(after);
}));

app.post("/leave-requests/:id/submit", asyncHandler(async (req, res) => {
  const auth = requireAuth(req.auth ?? null);
  const id = Number(req.params.id);
  const request = await queryRow<LeaveRequest>(
    `
      SELECT 
        id, user_id as "userId", type,
        start_date::text as "startDate",
        end_date::text as "endDate",
        is_half_day_start as "isHalfDayStart",
        is_half_day_end as "isHalfDayEnd",
        status, reason, manager_comment as "managerComment",
        approved_by as "approvedBy",
        approved_at as "approvedAt",
        computed_days as "computedDays",
        attachment_url as "attachmentUrl",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM leave_requests
      WHERE id = $1
    `,
    [id]
  );

  if (!request) {
    throw new HttpError(404, "Leave request not found");
  }

  if (auth.role !== "MANAGER" && request.userId !== auth.userID) {
    throw new HttpError(403, "Cannot submit another user's request");
  }

  if (request.status !== "DRAFT") {
    throw new HttpError(409, "Can only submit requests in DRAFT status");
  }

  const overlaps = await queryRow<{ count: number }>(
    `
      SELECT COUNT(*) as count
      FROM leave_requests
      WHERE user_id = $1
        AND id != $2
        AND status IN ('PENDING', 'APPROVED')
        AND start_date <= $3
        AND end_date >= $4
    `,
    [request.userId, id, request.endDate, request.startDate]
  );

  if (overlaps && overlaps.count > 0) {
    throw new HttpError(409, "Request overlaps with existing pending or approved request");
  }

  await pool.query("UPDATE leave_requests SET status = 'PENDING' WHERE id = $1", [id]);

  const updated = await queryRow<LeaveRequest>(
    `
      SELECT 
        id, user_id as "userId", type,
        start_date::text as "startDate",
        end_date::text as "endDate",
        is_half_day_start as "isHalfDayStart",
        is_half_day_end as "isHalfDayEnd",
        status, reason, manager_comment as "managerComment",
        approved_by as "approvedBy",
        approved_at as "approvedAt",
        computed_days as "computedDays",
        attachment_url as "attachmentUrl",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM leave_requests
      WHERE id = $1
    `,
    [id]
  );

  res.json(updated);
}));

app.post("/leave-requests/:id/approve", asyncHandler(async (req, res) => {
  const auth = requireAuth(req.auth ?? null);
  requireManager(auth.role);
  const id = Number(req.params.id);
  const { comment } = req.body as { comment?: string };

  const request = await queryRow<LeaveRequest & { teamId: number | null }>(
    `
      SELECT 
        lr.id, lr.user_id as "userId", lr.type,
        lr.start_date::text as "startDate",
        lr.end_date::text as "endDate",
        lr.is_half_day_start as "isHalfDayStart",
        lr.is_half_day_end as "isHalfDayEnd",
        lr.status, lr.reason, lr.manager_comment as "managerComment",
        lr.approved_by as "approvedBy",
        lr.approved_at as "approvedAt",
        lr.computed_days as "computedDays",
        lr.attachment_url as "attachmentUrl",
        lr.created_at as "createdAt",
        lr.updated_at as "updatedAt",
        u.team_id as "teamId"
      FROM leave_requests lr
      JOIN users u ON lr.user_id = u.id
      WHERE lr.id = $1
    `,
    [id]
  );

  if (!request) {
    throw new HttpError(404, "Leave request not found");
  }

  if (request.status !== "PENDING") {
    throw new HttpError(409, "Can only approve requests in PENDING status");
  }

  if (request.teamId) {
    const team = await queryRow<{ maxConcurrentLeaves: number | null }>(
      `
        SELECT max_concurrent_leaves as "maxConcurrentLeaves"
        FROM teams
        WHERE id = $1
      `,
      [request.teamId]
    );

    if (team?.maxConcurrentLeaves) {
      const count = await queryRow<{ count: number }>(
        `
          SELECT COUNT(*) as count
          FROM leave_requests lr
          JOIN users u ON lr.user_id = u.id
          WHERE u.team_id = $1
            AND lr.status = 'APPROVED'
            AND lr.start_date <= $2
            AND lr.end_date >= $3
        `,
        [request.teamId, request.endDate, request.startDate]
      );

      if (count && count.count >= team.maxConcurrentLeaves) {
        throw new HttpError(409, `Team concurrent leave limit (${team.maxConcurrentLeaves}) would be exceeded`);
      }
    }
  }

  await pool.query(
    `
      UPDATE leave_requests
      SET status = 'APPROVED',
          approved_by = $1,
          approved_at = NOW(),
          manager_comment = $2
      WHERE id = $3
    `,
    [auth.userID, comment ?? null, id]
  );

  const updated = await queryRow<LeaveRequest>(
    `
      SELECT 
        id, user_id as "userId", type,
        start_date::text as "startDate",
        end_date::text as "endDate",
        is_half_day_start as "isHalfDayStart",
        is_half_day_end as "isHalfDayEnd",
        status, reason, manager_comment as "managerComment",
        approved_by as "approvedBy",
        approved_at as "approvedAt",
        computed_days as "computedDays",
        attachment_url as "attachmentUrl",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM leave_requests
      WHERE id = $1
    `,
    [id]
  );

  res.json(updated);
}));

app.post("/leave-requests/:id/reject", asyncHandler(async (req, res) => {
  const auth = requireAuth(req.auth ?? null);
  requireManager(auth.role);
  const id = Number(req.params.id);
  const { comment } = req.body as { comment: string };

  const request = await queryRow<LeaveRequest>(
    `
      SELECT 
        id, user_id as "userId", type,
        start_date::text as "startDate",
        end_date::text as "endDate",
        is_half_day_start as "isHalfDayStart",
        is_half_day_end as "isHalfDayEnd",
        status, reason, manager_comment as "managerComment",
        approved_by as "approvedBy",
        approved_at as "approvedAt",
        computed_days as "computedDays",
        attachment_url as "attachmentUrl",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM leave_requests
      WHERE id = $1
    `,
    [id]
  );

  if (!request) {
    throw new HttpError(404, "Leave request not found");
  }

  if (request.status !== "PENDING") {
    throw new HttpError(409, "Can only reject requests in PENDING status");
  }

  await pool.query(
    `
      UPDATE leave_requests
      SET status = 'REJECTED',
          approved_by = $1,
          approved_at = NOW(),
          manager_comment = $2
      WHERE id = $3
    `,
    [auth.userID, comment, id]
  );

  const updated = await queryRow<LeaveRequest>(
    `
      SELECT 
        id, user_id as "userId", type,
        start_date::text as "startDate",
        end_date::text as "endDate",
        is_half_day_start as "isHalfDayStart",
        is_half_day_end as "isHalfDayEnd",
        status, reason, manager_comment as "managerComment",
        approved_by as "approvedBy",
        approved_at as "approvedAt",
        computed_days as "computedDays",
        attachment_url as "attachmentUrl",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM leave_requests
      WHERE id = $1
    `,
    [id]
  );

  res.json(updated);
}));

app.post("/leave-requests/:id/cancel", asyncHandler(async (req, res) => {
  const auth = requireAuth(req.auth ?? null);
  const id = Number(req.params.id);

  const request = await queryRow<LeaveRequest>(
    `
      SELECT 
        id, user_id as "userId", type,
        start_date::text as "startDate",
        end_date::text as "endDate",
        is_half_day_start as "isHalfDayStart",
        is_half_day_end as "isHalfDayEnd",
        status, reason, manager_comment as "managerComment",
        approved_by as "approvedBy",
        approved_at as "approvedAt",
        computed_days as "computedDays",
        attachment_url as "attachmentUrl",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM leave_requests
      WHERE id = $1
    `,
    [id]
  );

  if (!request) {
    throw new HttpError(404, "Leave request not found");
  }

  if (request.status === "CANCELLED") {
    throw new HttpError(409, "Request is already cancelled");
  }

  if (auth.role !== "MANAGER" && request.userId !== auth.userID) {
    throw new HttpError(403, "Cannot cancel another user's request");
  }

  await pool.query("UPDATE leave_requests SET status = 'CANCELLED' WHERE id = $1", [id]);

  const updated = await queryRow<LeaveRequest>(
    `
      SELECT 
        id, user_id as "userId", type,
        start_date::text as "startDate",
        end_date::text as "endDate",
        is_half_day_start as "isHalfDayStart",
        is_half_day_end as "isHalfDayEnd",
        status, reason, manager_comment as "managerComment",
        approved_by as "approvedBy",
        approved_at as "approvedAt",
        computed_days as "computedDays",
        attachment_url as "attachmentUrl",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM leave_requests
      WHERE id = $1
    `,
    [id]
  );

  res.json(updated);
}));

app.get("/calendar", asyncHandler(async (req, res) => {
  requireAuth(req.auth ?? null);
  const startDate = req.query.startDate as string;
  const endDate = req.query.endDate as string;
  const teamId = req.query.teamId ? Number(req.query.teamId) : undefined;

  if (!startDate || !endDate) {
    throw new HttpError(400, "startDate and endDate are required");
  }

  const conditions: string[] = [
    "lr.start_date <= $2",
    "lr.end_date >= $1",
    "lr.status != 'DRAFT'",
  ];
  const values: any[] = [startDate, endDate];

  if (teamId) {
    conditions.push(`u.team_id = $${values.length + 1}`);
    values.push(teamId);
  }

  const query = `
      SELECT 
        lr.id, lr.user_id as "userId", lr.type,
        lr.start_date::text as "startDate",
        lr.end_date::text as "endDate",
        lr.is_half_day_start as "isHalfDayStart",
        lr.is_half_day_end as "isHalfDayEnd",
        lr.status, lr.reason, lr.manager_comment as "managerComment",
        lr.approved_by as "approvedBy",
        lr.approved_at as "approvedAt",
        lr.computed_days as "computedDays",
        lr.attachment_url as "attachmentUrl",
        lr.created_at as "createdAt",
        lr.updated_at as "updatedAt",
        u.name as "userName",
        u.email as "userEmail"
      FROM leave_requests lr
      JOIN users u ON lr.user_id = u.id
      WHERE ${conditions.join(" AND ")}
      ORDER BY lr.start_date ASC
    `;

  const events = await queryRows<any>(query, values);
  res.json({ events });
}));

app.get("/audit", asyncHandler(async (req, res) => {
  const auth = requireAuth(req.auth ?? null);
  requireManager(auth.role);
  const entityType = req.query.entityType as string | undefined;
  const entityId = req.query.entityId as string | undefined;
  const limit = req.query.limit ? Number(req.query.limit) : 100;

  const conditions: string[] = ["1=1"];
  const values: any[] = [];

  if (entityType) {
    conditions.push(`entity_type = $${values.length + 1}`);
    values.push(entityType);
  }

  if (entityId) {
    conditions.push(`entity_id = $${values.length + 1}`);
    values.push(entityId);
  }

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

  const logs = await queryRows<AuditLog>(query, values);
  res.json({ logs });
}));

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ message: err.message });
  }

  if (err instanceof Error) {
    return res.status(500).json({ message: err.message });
  }

  return res.status(500).json({ message: "Unknown error" });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API server listening on http://localhost:${port}`);
});
