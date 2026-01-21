import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import { Pool, type PoolClient } from "pg";
import jwt from "jsonwebtoken";
import { randomBytes, createHash, randomUUID } from "crypto";
import { computeWorkingDays, parseDate } from "./shared/date-utils";
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

async function createAuditLog(
  actorUserId: string,
  action: string,
  details: Record<string, unknown>
): Promise<void> {
  await pool.query(
    `
      INSERT INTO audit_logs (actor_user_id, entity_type, entity_id, action, after_json)
      VALUES ($1, 'database', 'full', $2, $3)
    `,
    [actorUserId, action, JSON.stringify(details)]
  );
}

async function createEntityAuditLog(
  actorUserId: string,
  entityType: string,
  entityId: string | number,
  action: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null
): Promise<void> {
  await pool.query(
    `
      INSERT INTO audit_logs (actor_user_id, entity_type, entity_id, action, before_json, after_json)
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [
      actorUserId,
      entityType,
      String(entityId),
      action,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
    ]
  );
}

type DatabaseBackup = {
  version: number;
  exportedAt: string;
  tables: {
    teams: Record<string, unknown>[];
    users: Record<string, unknown>[];
    leave_requests: Record<string, unknown>[];
    holidays: Record<string, unknown>[];
    leave_balances: Record<string, unknown>[];
    audit_logs: Record<string, unknown>[];
    notifications: Record<string, unknown>[];
  };
};

async function insertRows(
  client: PoolClient,
  table: string,
  rows: Record<string, unknown>[]
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const columns = Object.keys(rows[0]);
  if (columns.length === 0) {
    return;
  }

  const values: unknown[] = [];
  const placeholders = rows
    .map((row, rowIndex) => {
      const offset = rowIndex * columns.length;
      columns.forEach((column) => {
        values.push(row[column] ?? null);
      });
      const cols = columns.map((_, colIndex) => `$${offset + colIndex + 1}`).join(", ");
      return `(${cols})`;
    })
    .join(", ");

  const query = `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${placeholders}`;
  await client.query(query, values);
}

async function resetSerialSequence(client: PoolClient, table: string, column: string): Promise<void> {
  await client.query(
    `
      SELECT setval(
        pg_get_serial_sequence('${table}', '${column}'),
        COALESCE(MAX(${column}), 1),
        MAX(${column}) IS NOT NULL
      )
      FROM ${table}
    `
  );
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
      ORDER BY name ASC
    `
  );

  res.json({ users });
}));

app.post("/users", asyncHandler(async (req, res) => {
  const auth = requireAuth(req.auth ?? null);
  requireManager(auth.role);
  const { email, name, role, teamId } = req.body as {
    email?: string;
    name?: string;
    role?: UserRole;
    teamId?: number | null;
  };

  if (!email || !name) {
    throw new HttpError(400, "Email and name are required");
  }

  validateEmail(email);

  const userId = randomUUID();
  const userRole: UserRole = role ?? "EMPLOYEE";

  try {
    await pool.query(
      `
        INSERT INTO users (id, email, name, role, team_id, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      `,
      [userId, email, name, userRole, teamId ?? null]
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("duplicate key")) {
      throw new HttpError(409, "User already exists");
    }
    throw error;
  }

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
    [userId]
  );

  if (!user) {
    throw new HttpError(500, "User creation failed");
  }

  await createEntityAuditLog(auth.userID, "users", userId, "CREATE", null, user as unknown as Record<string, unknown>);

  res.json(user);
}));

app.patch("/users/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req.auth ?? null);
  requireManager(auth.role);
  const { id } = req.params;
  const { email, name, role, teamId, isActive } = req.body as {
    email?: string;
    name?: string;
    role?: UserRole;
    teamId?: number | null;
    isActive?: boolean;
  };

  const before = await queryRow<Record<string, unknown>>("SELECT * FROM users WHERE id = $1", [id]);
  if (!before) {
    throw new HttpError(404, "User not found");
  }

  if (email !== undefined) {
    validateEmail(email);
  }

  const updates: string[] = [];
  const values: any[] = [];

  if (email !== undefined) {
    updates.push(`email = $${values.length + 1}`);
    values.push(email);
  }
  if (name !== undefined) {
    updates.push(`name = $${values.length + 1}`);
    values.push(name);
  }
  if (role !== undefined) {
    updates.push(`role = $${values.length + 1}`);
    values.push(role);
  }
  if (teamId !== undefined) {
    updates.push(`team_id = $${values.length + 1}`);
    values.push(teamId ?? null);
  }
  if (isActive !== undefined) {
    updates.push(`is_active = $${values.length + 1}`);
    values.push(isActive);
  }

  if (updates.length > 0) {
    values.push(id);
    updates.push(`updated_at = NOW()`);
    await pool.query(
      `UPDATE users SET ${updates.join(", ")} WHERE id = $${values.length}`,
      values
    );
  }

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
    [id]
  );

  if (!user) {
    throw new HttpError(404, "User not found");
  }

  await createEntityAuditLog(auth.userID, "users", id, "UPDATE", before, user as unknown as Record<string, unknown>);

  res.json(user);
}));

app.delete("/users/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req.auth ?? null);
  requireManager(auth.role);
  const { id } = req.params;

  const before = await queryRow<Record<string, unknown>>("SELECT * FROM users WHERE id = $1", [id]);
  if (!before) {
    throw new HttpError(404, "User not found");
  }

  const leaveRequestCount = await queryRow<{ count: string }>(
    "SELECT COUNT(*) as count FROM leave_requests WHERE user_id = $1",
    [id]
  );
  const leaveBalanceCount = await queryRow<{ count: string }>(
    "SELECT COUNT(*) as count FROM leave_balances WHERE user_id = $1",
    [id]
  );
  const notificationCount = await queryRow<{ count: string }>(
    "SELECT COUNT(*) as count FROM notifications WHERE user_id = $1",
    [id]
  );

  const totalDependencies = Number(leaveRequestCount?.count ?? 0)
    + Number(leaveBalanceCount?.count ?? 0)
    + Number(notificationCount?.count ?? 0);

  if (totalDependencies > 0) {
    throw new HttpError(409, "Cannot delete user with related data. Remove related records first.");
  }

  await pool.query("DELETE FROM users WHERE id = $1", [id]);
  await createEntityAuditLog(auth.userID, "users", id, "DELETE", before, null);

  res.json({ ok: true });
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

app.post("/teams", asyncHandler(async (req, res) => {
  const auth = requireAuth(req.auth ?? null);
  requireManager(auth.role);
  const { name, maxConcurrentLeaves } = req.body as {
    name?: string;
    maxConcurrentLeaves?: number | null;
  };

  if (!name) {
    throw new HttpError(400, "Team name is required");
  }

  let result: { id: number } | null = null;
  try {
    result = await queryRow<{ id: number }>(
      `
        INSERT INTO teams (name, max_concurrent_leaves, created_at, updated_at)
        VALUES ($1, $2, NOW(), NOW())
        RETURNING id
      `,
      [name, maxConcurrentLeaves ?? null]
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("duplicate key")) {
      throw new HttpError(409, "Team with this name already exists");
    }
    throw error;
  }

  if (!result) {
    throw new HttpError(500, "Team creation failed");
  }

  const team = await queryRow<Team>(
    `
      SELECT id, name,
        max_concurrent_leaves as "maxConcurrentLeaves",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM teams
      WHERE id = $1
    `,
    [result.id]
  );

  if (!team) {
    throw new HttpError(500, "Team creation failed");
  }

  await createEntityAuditLog(auth.userID, "teams", team.id, "CREATE", null, team as unknown as Record<string, unknown>);

  res.json(team);
}));

app.patch("/teams/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req.auth ?? null);
  requireManager(auth.role);
  const id = Number(req.params.id);
  const { name, maxConcurrentLeaves } = req.body as {
    name?: string;
    maxConcurrentLeaves?: number | null;
  };

  const before = await queryRow<Record<string, unknown>>("SELECT * FROM teams WHERE id = $1", [id]);
  if (!before) {
    throw new HttpError(404, "Team not found");
  }

  const updates: string[] = [];
  const values: any[] = [];

  if (name !== undefined) {
    updates.push(`name = $${values.length + 1}`);
    values.push(name);
  }
  if (maxConcurrentLeaves !== undefined) {
    updates.push(`max_concurrent_leaves = $${values.length + 1}`);
    values.push(maxConcurrentLeaves ?? null);
  }

  if (updates.length > 0) {
    values.push(id);
    updates.push(`updated_at = NOW()`);
    try {
      await pool.query(`UPDATE teams SET ${updates.join(", ")} WHERE id = $${values.length}`, values);
    } catch (error) {
      if (error instanceof Error && error.message.includes("duplicate key")) {
        throw new HttpError(409, "Team with this name already exists");
      }
      throw error;
    }
  }

  const team = await queryRow<Team>(
    `
      SELECT id, name,
        max_concurrent_leaves as "maxConcurrentLeaves",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM teams
      WHERE id = $1
    `,
    [id]
  );

  if (!team) {
    throw new HttpError(404, "Team not found");
  }

  await createEntityAuditLog(auth.userID, "teams", id, "UPDATE", before, team as unknown as Record<string, unknown>);

  res.json(team);
}));

app.delete("/teams/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req.auth ?? null);
  requireManager(auth.role);
  const id = Number(req.params.id);

  const before = await queryRow<Record<string, unknown>>("SELECT * FROM teams WHERE id = $1", [id]);
  if (!before) {
    throw new HttpError(404, "Team not found");
  }

  const userCount = await queryRow<{ count: string }>(
    "SELECT COUNT(*) as count FROM users WHERE team_id = $1",
    [id]
  );

  if (userCount && Number(userCount.count) > 0) {
    throw new HttpError(409, "Cannot delete team with active users. Reassign users first.");
  }

  await pool.query("DELETE FROM teams WHERE id = $1", [id]);
  await createEntityAuditLog(auth.userID, "teams", id, "DELETE", before, null);

  res.json({ ok: true });
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

app.post("/holidays", asyncHandler(async (req, res) => {
  const auth = requireAuth(req.auth ?? null);
  requireManager(auth.role);
  const { date, name, isCompanyHoliday } = req.body as {
    date?: string;
    name?: string;
    isCompanyHoliday?: boolean;
  };

  if (!date || !name) {
    throw new HttpError(400, "Date and name are required");
  }

  try {
    parseDate(date);
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : "Invalid date");
  }

  let result: { id: number } | null = null;
  try {
    result = await queryRow<{ id: number }>(
      `
        INSERT INTO holidays (date, name, is_company_holiday)
        VALUES ($1, $2, $3)
        RETURNING id
      `,
      [date, name, isCompanyHoliday ?? true]
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("duplicate key")) {
      throw new HttpError(409, "Holiday for this date already exists");
    }
    throw error;
  }

  if (!result) {
    throw new HttpError(500, "Holiday creation failed");
  }

  const holiday = await queryRow<Holiday>(
    `
      SELECT id, date::text as date, name,
        is_company_holiday as "isCompanyHoliday",
        created_at as "createdAt"
      FROM holidays
      WHERE id = $1
    `,
    [result.id]
  );

  if (!holiday) {
    throw new HttpError(500, "Holiday creation failed");
  }

  await createEntityAuditLog(auth.userID, "holidays", holiday.id, "CREATE", null, holiday as unknown as Record<string, unknown>);

  res.json(holiday);
}));

app.patch("/holidays/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req.auth ?? null);
  requireManager(auth.role);
  const id = Number(req.params.id);
  const { date, name, isCompanyHoliday } = req.body as {
    date?: string;
    name?: string;
    isCompanyHoliday?: boolean;
  };

  const before = await queryRow<Record<string, unknown>>("SELECT * FROM holidays WHERE id = $1", [id]);
  if (!before) {
    throw new HttpError(404, "Holiday not found");
  }

  if (date !== undefined) {
    try {
      parseDate(date);
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : "Invalid date");
    }
  }

  const updates: string[] = [];
  const values: any[] = [];

  if (date !== undefined) {
    updates.push(`date = $${values.length + 1}`);
    values.push(date);
  }
  if (name !== undefined) {
    updates.push(`name = $${values.length + 1}`);
    values.push(name);
  }
  if (isCompanyHoliday !== undefined) {
    updates.push(`is_company_holiday = $${values.length + 1}`);
    values.push(isCompanyHoliday);
  }

  if (updates.length > 0) {
    values.push(id);
    try {
      await pool.query(
        `UPDATE holidays SET ${updates.join(", ")} WHERE id = $${values.length}`,
        values
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes("duplicate key")) {
        throw new HttpError(409, "Holiday for this date already exists");
      }
      throw error;
    }
  }

  const holiday = await queryRow<Holiday>(
    `
      SELECT id, date::text as date, name,
        is_company_holiday as "isCompanyHoliday",
        created_at as "createdAt"
      FROM holidays
      WHERE id = $1
    `,
    [id]
  );

  if (!holiday) {
    throw new HttpError(404, "Holiday not found");
  }

  await createEntityAuditLog(auth.userID, "holidays", id, "UPDATE", before, holiday as unknown as Record<string, unknown>);

  res.json(holiday);
}));

app.delete("/holidays/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req.auth ?? null);
  requireManager(auth.role);
  const id = Number(req.params.id);

  const before = await queryRow<Record<string, unknown>>("SELECT * FROM holidays WHERE id = $1", [id]);
  if (!before) {
    throw new HttpError(404, "Holiday not found");
  }

  await pool.query("DELETE FROM holidays WHERE id = $1", [id]);
  await createEntityAuditLog(auth.userID, "holidays", id, "DELETE", before, null);

  res.json({ ok: true });
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
  const { type, startDate, endDate, isHalfDayStart, isHalfDayEnd, reason, userId } = req.body as {
    type: LeaveType;
    startDate: string;
    endDate: string;
    isHalfDayStart?: boolean;
    isHalfDayEnd?: boolean;
    reason?: string;
    userId?: string;
  };

  const targetUserId = userId ?? auth.userID;
  if (targetUserId !== auth.userID) {
    requireManager(auth.role);
  }

  const userExists = await queryRow<{ id: string }>(
    "SELECT id FROM users WHERE id = $1 AND is_active = true",
    [targetUserId]
  );
  if (!userExists) {
    throw new HttpError(404, "User not found");
  }

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
        reason, computed_days, status,
        created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'DRAFT', NOW(), NOW())
      RETURNING id
    `,
    [targetUserId, type, startDate, endDate, isHalfDayStart ?? false, isHalfDayEnd ?? false, reason ?? null, computedDays]
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
    updates.push("updated_at = NOW()");
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

app.delete("/leave-requests/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req.auth ?? null);
  const id = Number(req.params.id);

  if (auth.role !== "MANAGER") {
    throw new HttpError(403, "Employees cannot delete requests; use cancel.");
  }

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

  await pool.query("DELETE FROM leave_requests WHERE id = $1", [id]);
  res.json({ ok: true });
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
  const auth = requireAuth(req.auth ?? null);
  const startDate = req.query.startDate as string;
  const endDate = req.query.endDate as string;
  const teamId = req.query.teamId ? Number(req.query.teamId) : undefined;
  const isManager = auth.role === "MANAGER";
  const viewerId = auth.userID;
  let viewerTeamId: number | null = null;
  const settings = await queryRow<{ showTeamCalendarForEmployees: boolean }>(
    "SELECT show_team_calendar_for_employees as \"showTeamCalendarForEmployees\" FROM settings LIMIT 1",
    []
  );
  const showTeamCalendarForEmployees = settings?.showTeamCalendarForEmployees ?? false;

  if (!isManager) {
    const viewer = await queryRow<{ teamId: number | null }>(
      "SELECT team_id as \"teamId\" FROM users WHERE id = $1",
      [viewerId]
    );

    if (!viewer) {
      throw new HttpError(404, "User not found");
    }

    viewerTeamId = viewer.teamId;
  }

  if (!startDate || !endDate) {
    throw new HttpError(400, "startDate and endDate are required");
  }

  const conditions: string[] = [
    "lr.start_date <= $2",
    "lr.end_date >= $1",
    "lr.status != 'DRAFT'",
    "lr.status != 'REJECTED'",
  ];
  const values: any[] = [startDate, endDate];

  if (isManager && teamId) {
    conditions.push(`u.team_id = $${values.length + 1}`);
    values.push(teamId);
  }

  if (!isManager) {
    if (showTeamCalendarForEmployees && viewerTeamId) {
      conditions.push(`u.team_id = $${values.length + 1}`);
      values.push(viewerTeamId);
    } else {
      conditions.push(`lr.user_id = $${values.length + 1}`);
      values.push(viewerId);
    }
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
  const safeEvents = events.map((event) => {
    if (!isManager && event.userId !== viewerId) {
      return {
        ...event,
        reason: null,
        managerComment: null,
      };
    }

    return event;
  });

  res.json({ events: safeEvents });
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

app.get("/admin/database/export", asyncHandler(async (req, res) => {
  const auth = requireAuth(req.auth ?? null);
  requireManager(auth.role);

  const tables = {
    teams: await queryRows<Record<string, unknown>>("SELECT * FROM teams ORDER BY id ASC"),
    users: await queryRows<Record<string, unknown>>("SELECT * FROM users ORDER BY id ASC"),
    leave_requests: await queryRows<Record<string, unknown>>("SELECT * FROM leave_requests ORDER BY id ASC"),
    holidays: await queryRows<Record<string, unknown>>("SELECT * FROM holidays ORDER BY id ASC"),
    leave_balances: await queryRows<Record<string, unknown>>("SELECT * FROM leave_balances ORDER BY id ASC"),
    audit_logs: await queryRows<Record<string, unknown>>("SELECT * FROM audit_logs ORDER BY id ASC"),
    notifications: await queryRows<Record<string, unknown>>("SELECT * FROM notifications ORDER BY id ASC"),
  };

  const backup: DatabaseBackup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    tables,
  };

  await createAuditLog(auth.userID, "database.export", {
    exportedAt: backup.exportedAt,
    counts: Object.fromEntries(
      Object.entries(tables).map(([name, rows]) => [name, rows.length])
    ),
  });

  res.json(backup);
}));

app.post("/admin/database/import", asyncHandler(async (req, res) => {
  const auth = requireAuth(req.auth ?? null);
  requireManager(auth.role);

  const { backup, confirm } = req.body as { backup?: DatabaseBackup; confirm?: string };

  if (confirm !== "IMPORT") {
    throw new HttpError(400, "Invalid confirmation. Type IMPORT to proceed.");
  }

  if (!backup || typeof backup !== "object") {
    throw new HttpError(400, "Backup payload is required.");
  }

  if (backup.version !== 1) {
    throw new HttpError(400, "Unsupported backup version.");
  }

  const requiredTables = [
    "teams",
    "users",
    "leave_requests",
    "holidays",
    "leave_balances",
    "audit_logs",
    "notifications",
  ] as const;

  if (!backup.tables) {
    throw new HttpError(400, "Backup tables are missing.");
  }

  const missing = requiredTables.filter((table) => !Array.isArray(backup.tables[table]));
  if (missing.length > 0) {
    throw new HttpError(400, `Backup is missing tables: ${missing.join(", ")}`);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "TRUNCATE teams, users, leave_requests, holidays, leave_balances, audit_logs, notifications RESTART IDENTITY CASCADE"
    );

    await insertRows(client, "teams", backup.tables.teams);
    await insertRows(client, "users", backup.tables.users);
    await insertRows(client, "holidays", backup.tables.holidays);
    await insertRows(client, "leave_balances", backup.tables.leave_balances);
    await insertRows(client, "leave_requests", backup.tables.leave_requests);
    await insertRows(client, "audit_logs", backup.tables.audit_logs);
    await insertRows(client, "notifications", backup.tables.notifications);

    await resetSerialSequence(client, "teams", "id");
    await resetSerialSequence(client, "leave_requests", "id");
    await resetSerialSequence(client, "holidays", "id");
    await resetSerialSequence(client, "leave_balances", "id");
    await resetSerialSequence(client, "audit_logs", "id");
    await resetSerialSequence(client, "notifications", "id");

    await client.query(
      `
        INSERT INTO audit_logs (actor_user_id, entity_type, entity_id, action, after_json)
        VALUES ($1, 'database', 'full', 'database.import', $2)
      `,
      [
        auth.userID,
        JSON.stringify({
          importedAt: new Date().toISOString(),
          counts: Object.fromEntries(
            requiredTables.map((table) => [table, backup.tables[table].length])
          ),
        }),
      ]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  res.json({ ok: true });
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

async function startServer() {
  await pool.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`API server listening on http://localhost:${port}`);
  });
}

startServer().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start server", err);
  process.exit(1);
});
