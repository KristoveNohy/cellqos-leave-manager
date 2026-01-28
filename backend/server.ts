import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import { Pool, type PoolClient } from "pg";
import jwt from "jsonwebtoken";
import { randomBytes, createHash, randomUUID } from "crypto";
import { computeWorkingHours, parseDate } from "./shared/date-utils";
import { getSlovakHolidaySeeds } from "./shared/holiday-seeds";
import { validateDateRange, validateNotInPast, validateEmail } from "./shared/validation";
import { canEditRequest, requireManager, requireAuth } from "./shared/rbac";
import {
  computeAnnualLeaveAllowanceHours,
  computeCarryOverHours,
  getAnnualLeaveGroupAllowanceHours,
} from "./shared/leave-entitlement";
import type {
  LeaveRequest,
  LeaveStatus,
  LeaveType,
  Team,
  User,
  Holiday,
  UserRole,
  AuditLog,
  Notification,
  VacationPolicy,
  VacationAccrualPolicy,
} from "./shared/types";
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

async function getVacationPolicy(): Promise<VacationPolicy> {
  const policySupport = await getVacationPolicySupport();
  if (!policySupport.hasPolicyColumns) {
    return {
      accrualPolicy: "PRO_RATA",
      carryOverEnabled: true,
      carryOverLimitHours: 0,
    };
  }

  const policy = await queryRow<{
    accrualPolicy: VacationAccrualPolicy;
    carryOverEnabled: boolean;
    carryOverLimitHours: number;
  }>(
    `
      SELECT
        annual_leave_accrual_policy as "accrualPolicy",
        carry_over_enabled as "carryOverEnabled",
        carry_over_limit_hours as "carryOverLimitHours"
      FROM settings
      LIMIT 1
    `
  );

  return (
    policy ?? {
      accrualPolicy: "PRO_RATA",
      carryOverEnabled: true,
      carryOverLimitHours: 0,
    }
  );
}

type UserColumnSupport = {
  employmentStartDate: boolean;
  manualLeaveAllowanceHours: boolean;
};

type VacationPolicyColumnSupport = {
  hasPolicyColumns: boolean;
};

const columnSupportCache = new Map<string, boolean>();

async function columnExists(table: string, column: string): Promise<boolean> {
  const cacheKey = `${table}.${column}`;
  const cached = columnSupportCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const result = await queryRow<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = $1
          AND column_name = $2
      ) as "exists"
    `,
    [table, column]
  );
  const exists = Boolean(result?.exists);
  columnSupportCache.set(cacheKey, exists);
  return exists;
}

async function getUserColumnSupport(): Promise<UserColumnSupport> {
  const [employmentStartDate, manualLeaveAllowanceHours] = await Promise.all([
    columnExists("users", "employment_start_date"),
    columnExists("users", "manual_leave_allowance_hours"),
  ]);

  return {
    employmentStartDate,
    manualLeaveAllowanceHours,
  };
}

async function getVacationPolicySupport(): Promise<VacationPolicyColumnSupport> {
  const [accrualPolicy, carryOverEnabled, carryOverLimitHours] = await Promise.all([
    columnExists("settings", "annual_leave_accrual_policy"),
    columnExists("settings", "carry_over_enabled"),
    columnExists("settings", "carry_over_limit_hours"),
  ]);

  return {
    hasPolicyColumns: accrualPolicy && carryOverEnabled && carryOverLimitHours,
  };
}

async function getAnnualLeaveAllowanceHoursForUser(userId: string, year: number): Promise<number> {
  const columnSupport = await getUserColumnSupport();
  const user = await queryRow<{
    birthDate: string | null;
    hasChild: boolean;
    employmentStartDate: string | null;
    manualLeaveAllowanceHours: number | null;
  }>(
    `
      SELECT birth_date::text as "birthDate",
        has_child as "hasChild",
        ${columnSupport.employmentStartDate ? `employment_start_date::text` : "NULL"} as "employmentStartDate",
        ${columnSupport.manualLeaveAllowanceHours ? `manual_leave_allowance_hours` : "NULL"} as "manualLeaveAllowanceHours"
      FROM users
      WHERE id = $1
    `,
    [userId]
  );

  if (!user) {
    return 0;
  }

  const policy = await getVacationPolicy();

  const baseAllowanceHours = computeAnnualLeaveAllowanceHours({
    birthDate: user.birthDate,
    hasChild: user.hasChild,
    year,
    employmentStartDate: user.employmentStartDate,
    manualAllowanceHours: user.manualLeaveAllowanceHours,
    accrualPolicy: policy.accrualPolicy,
  });

  if (!policy.carryOverEnabled) {
    return baseAllowanceHours;
  }

  const previousYear = year - 1;
  const previousAllowanceHours = computeAnnualLeaveAllowanceHours({
    birthDate: user.birthDate,
    hasChild: user.hasChild,
    year: previousYear,
    employmentStartDate: user.employmentStartDate,
    manualAllowanceHours: user.manualLeaveAllowanceHours,
    accrualPolicy: policy.accrualPolicy,
  });

  const previousUsed = await queryRow<{ total: number }>(
    `
      SELECT COALESCE(SUM(computed_hours), 0) as total
      FROM leave_requests
      WHERE user_id = $1
        AND type = 'ANNUAL_LEAVE'
        AND status IN ('PENDING', 'APPROVED')
        AND EXTRACT(YEAR FROM start_date) = $2
    `,
    [userId, previousYear]
  );

  const carryOverLimitHours = getAnnualLeaveGroupAllowanceHours({
    birthDate: user.birthDate,
    hasChild: user.hasChild,
    year,
  });

  const carryOverHours = computeCarryOverHours({
    previousAllowance: previousAllowanceHours,
    previousUsed: Number(previousUsed?.total ?? 0),
    carryOverLimit: carryOverLimitHours,
  });

  return baseAllowanceHours + carryOverHours;
}

function parseBooleanFlag(value: unknown): boolean {
  return value === "true" || value === "1" || value === true;
}

async function ensureSlovakHolidaysForYear(year: number, actorUserId: string): Promise<void> {
  const seeds = getSlovakHolidaySeeds(year);
  const existingRows = await queryRows<{ date: string }>(
    `
      SELECT date::date::text as date
      FROM holidays
      WHERE EXTRACT(YEAR FROM date) = $1
    `,
    [year]
  );
  const existingDates = new Set(existingRows.map((row) => row.date));

  for (const seed of seeds) {
    if (existingDates.has(seed.date)) {
      continue;
    }

    const holiday = await queryRow<Holiday>(
      `
        INSERT INTO holidays (date, name, is_company_holiday, is_active)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (date) DO NOTHING
        RETURNING id, date::date::text as date, name,
          is_company_holiday as "isCompanyHoliday",
          is_active as "isActive",
          created_at as "createdAt"
      `,
      [seed.date, seed.name, seed.isCompanyHoliday, true]
    );

    if (holiday) {
      await createEntityAuditLog(
        actorUserId,
        "holidays",
        holiday.id,
        "CREATE",
        null,
        holiday as unknown as Record<string, unknown>
      );
    }
  }
}

let notificationsDedupeKeySupported: boolean | null = null;

async function hasNotificationsDedupeKey(): Promise<boolean> {
  if (notificationsDedupeKeySupported !== null) {
    return notificationsDedupeKeySupported;
  }
  const result = await pool.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'notifications'
          AND column_name = 'dedupe_key'
      ) as "exists"
    `
  );
  notificationsDedupeKeySupported = result.rows[0]?.exists ?? false;
  return notificationsDedupeKeySupported;
}

async function createNotification(
  userId: string,
  type: string,
  payload: Record<string, unknown>,
  dedupeKey?: string | null
): Promise<void> {
  const supportsDedupeKey = await hasNotificationsDedupeKey();
  if (supportsDedupeKey) {
    await pool.query(
      `
        INSERT INTO notifications (user_id, type, payload_json, dedupe_key)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (dedupe_key) DO NOTHING
      `,
      [userId, type, JSON.stringify(payload), dedupeKey ?? null]
    );
    return;
  }
  await pool.query(
    `
      INSERT INTO notifications (user_id, type, payload_json)
      VALUES ($1, $2, $3)
    `,
    [userId, type, JSON.stringify(payload)]
  );
}

async function getShowTeamCalendarForEmployees(): Promise<boolean> {
  try {
    const settings = await queryRow<{ showTeamCalendarForEmployees: boolean }>(
      "SELECT show_team_calendar_for_employees as \"showTeamCalendarForEmployees\" FROM settings LIMIT 1",
      []
    );
    return settings?.showTeamCalendarForEmployees ?? false;
  } catch {
    return false;
  }
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
    settings: Record<string, unknown>[];
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
  const columnSupport = await getUserColumnSupport();
  const user = await queryRow<User>(
    `
      SELECT id, email, name, role,
        team_id as "teamId",
        ${columnSupport.employmentStartDate ? `employment_start_date::text` : "NULL"} as "employmentStartDate",
        birth_date::text as "birthDate",
        has_child as "hasChild",
        ${columnSupport.manualLeaveAllowanceHours ? `manual_leave_allowance_hours` : "NULL"} as "manualLeaveAllowanceHours",
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

app.get("/leave-balances/me", asyncHandler(async (req, res) => {
  const auth = requireAuth(req.auth ?? null);
  const currentYear = new Date().getFullYear();
  const booked = await queryRow<{ total: number }>(
    `
      SELECT COALESCE(SUM(computed_hours), 0) as total
      FROM leave_requests
      WHERE user_id = $1
        AND type = 'ANNUAL_LEAVE'
        AND status IN ('PENDING', 'APPROVED')
        AND EXTRACT(YEAR FROM start_date) = $2
    `,
    [auth.userID, currentYear]
  );

  const allowanceHours = await getAnnualLeaveAllowanceHoursForUser(auth.userID, currentYear);
  const usedHours = Number(booked?.total ?? 0);

  res.json({
    year: currentYear,
    allowanceHours,
    usedHours,
    remainingHours: allowanceHours - usedHours,
  });
}));

app.get("/users", asyncHandler(async (req, res) => {
  const auth = requireAuth(req.auth ?? null);
  requireManager(auth.role);
  const columnSupport = await getUserColumnSupport();

  const users = await queryRows<User>(
    `
      SELECT id, email, name, role,
        team_id as "teamId",
        ${columnSupport.employmentStartDate ? `employment_start_date::text` : "NULL"} as "employmentStartDate",
        birth_date::text as "birthDate",
        has_child as "hasChild",
        ${columnSupport.manualLeaveAllowanceHours ? `manual_leave_allowance_hours` : "NULL"} as "manualLeaveAllowanceHours",
        NULL::double precision as "remainingLeaveHours",
        is_active as "isActive",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM users
      ORDER BY name ASC
    `
  );

  const year = new Date().getFullYear();
  const balanceRows = await queryRows<{ userId: string; total: number }>(
    `
      SELECT user_id as "userId",
        COALESCE(SUM(computed_hours), 0) as total
      FROM leave_requests
      WHERE type = 'ANNUAL_LEAVE'
        AND status IN ('PENDING', 'APPROVED')
        AND EXTRACT(YEAR FROM start_date) = $1
      GROUP BY user_id
    `,
    [year]
  );
  const bookedByUserId = new Map(
    balanceRows.map((row) => [row.userId, Number(row.total ?? 0)])
  );

  const usersWithBalances = await Promise.all(
    users.map(async (user) => {
      const allowanceHours = await getAnnualLeaveAllowanceHoursForUser(user.id, year);
      const usedHours = bookedByUserId.get(user.id) ?? 0;
      return {
        ...user,
        remainingLeaveHours: allowanceHours - usedHours,
      };
    })
  );

  res.json({ users: usersWithBalances });
}));

app.post("/users", asyncHandler(async (req, res) => {
  const auth = requireAuth(req.auth ?? null);
  requireManager(auth.role);
  const columnSupport = await getUserColumnSupport();
  const { email, name, role, teamId, birthDate, hasChild, employmentStartDate, manualLeaveAllowanceHours } = req.body as {
    email?: string;
    name?: string;
    role?: UserRole;
    teamId?: number | null;
    birthDate?: string | null;
    hasChild?: boolean;
    employmentStartDate?: string | null;
    manualLeaveAllowanceHours?: number | null;
  };

  if (!email || !name) {
    throw new HttpError(400, "Email and name are required");
  }

  validateEmail(email);

  const userId = randomUUID();
  const userRole: UserRole = role ?? "EMPLOYEE";

  if (manualLeaveAllowanceHours !== undefined && manualLeaveAllowanceHours !== null) {
    if (Number.isNaN(manualLeaveAllowanceHours) || manualLeaveAllowanceHours < 0) {
      throw new HttpError(400, "Manual leave allowance must be a non-negative number.");
    }
  }

  try {
    const columns = ["id", "email", "name", "role", "team_id", "birth_date", "has_child", "created_at", "updated_at"];
    const values: any[] = [userId, email, name, userRole, teamId ?? null, birthDate ?? null, hasChild ?? false];

    if (columnSupport.employmentStartDate) {
      columns.splice(5, 0, "employment_start_date");
      values.splice(5, 0, employmentStartDate ?? null);
    }

    if (columnSupport.manualLeaveAllowanceHours) {
      columns.splice(columnSupport.employmentStartDate ? 7 : 6, 0, "manual_leave_allowance_hours");
      values.splice(columnSupport.employmentStartDate ? 7 : 6, 0, manualLeaveAllowanceHours ?? null);
    }

    const placeholders: string[] = values.map((_value, index) => `$${index + 1}`);
    placeholders.push("NOW()", "NOW()");

    await pool.query(
      `
        INSERT INTO users (${columns.join(", ")})
        VALUES (${placeholders.join(", ")})
      `,
      values
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
        ${columnSupport.employmentStartDate ? `employment_start_date::text` : "NULL"} as "employmentStartDate",
        birth_date::text as "birthDate",
        has_child as "hasChild",
        ${columnSupport.manualLeaveAllowanceHours ? `manual_leave_allowance_hours` : "NULL"} as "manualLeaveAllowanceHours",
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
  const columnSupport = await getUserColumnSupport();
  const { email, name, role, teamId, isActive, birthDate, hasChild, employmentStartDate, manualLeaveAllowanceHours } = req.body as {
    email?: string;
    name?: string;
    role?: UserRole;
    teamId?: number | null;
    isActive?: boolean;
    birthDate?: string | null;
    hasChild?: boolean;
    employmentStartDate?: string | null;
    manualLeaveAllowanceHours?: number | null;
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
  if (columnSupport.employmentStartDate && employmentStartDate !== undefined) {
    updates.push(`employment_start_date = $${values.length + 1}`);
    values.push(employmentStartDate);
  }
  if (birthDate !== undefined) {
    updates.push(`birth_date = $${values.length + 1}`);
    values.push(birthDate);
  }
  if (hasChild !== undefined) {
    updates.push(`has_child = $${values.length + 1}`);
    values.push(hasChild);
  }
  if (columnSupport.manualLeaveAllowanceHours && manualLeaveAllowanceHours !== undefined) {
    if (manualLeaveAllowanceHours !== null && (Number.isNaN(manualLeaveAllowanceHours) || manualLeaveAllowanceHours < 0)) {
      throw new HttpError(400, "Manual leave allowance must be a non-negative number.");
    }
    updates.push(`manual_leave_allowance_hours = $${values.length + 1}`);
    values.push(manualLeaveAllowanceHours);
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
        ${columnSupport.employmentStartDate ? `employment_start_date::text` : "NULL"} as "employmentStartDate",
        birth_date::text as "birthDate",
        has_child as "hasChild",
        ${columnSupport.manualLeaveAllowanceHours ? `manual_leave_allowance_hours` : "NULL"} as "manualLeaveAllowanceHours",
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
  const auth = requireAuth(req.auth ?? null);
  const yearParam = req.query.year;
  const year = yearParam ? Number(yearParam) : undefined;
  if (yearParam && !Number.isFinite(year)) {
    throw new HttpError(400, "Invalid year");
  }
  const includeInactive = parseBooleanFlag(req.query.includeInactive);

  if (year) {
    await ensureSlovakHolidaysForYear(year, auth.userID);
  }

  const conditions: string[] = [];
  const values: any[] = [];

  if (year) {
    values.push(year);
    conditions.push(`EXTRACT(YEAR FROM date) = $${values.length}`);
  }
  if (!includeInactive) {
    conditions.push("is_active = true");
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const holidays = await queryRows<Holiday>(
    `
      SELECT id, date::date::text as date, name,
        is_company_holiday as "isCompanyHoliday",
        is_active as "isActive",
        created_at as "createdAt"
      FROM holidays
      ${whereClause}
      ORDER BY date ASC
    `,
    values
  );

  res.json({ holidays });
}));

app.post("/holidays", asyncHandler(async (req, res) => {
  const auth = requireAuth(req.auth ?? null);
  requireManager(auth.role);
  const { date, name, isCompanyHoliday, isActive } = req.body as {
    date?: string;
    name?: string;
    isCompanyHoliday?: boolean;
    isActive?: boolean;
  };

  if (!date || !name) {
    throw new HttpError(400, "Date and name are required");
  }

  if (isActive !== undefined && typeof isActive !== "boolean") {
    throw new HttpError(400, "isActive must be a boolean");
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
        INSERT INTO holidays (date, name, is_company_holiday, is_active)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `,
      [date, name, isCompanyHoliday ?? true, isActive ?? true]
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
      SELECT id, date::date::text as date, name,
        is_company_holiday as "isCompanyHoliday",
        is_active as "isActive",
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
  const { date, name, isCompanyHoliday, isActive } = req.body as {
    date?: string;
    name?: string;
    isCompanyHoliday?: boolean;
    isActive?: boolean;
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
  if (isActive !== undefined && typeof isActive !== "boolean") {
    throw new HttpError(400, "isActive must be a boolean");
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
  if (isActive !== undefined) {
    updates.push(`is_active = $${values.length + 1}`);
    values.push(isActive);
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
      SELECT id, date::date::text as date, name,
        is_company_holiday as "isCompanyHoliday",
        is_active as "isActive",
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
        u.name as "userName",
        lr.start_date::text as "startDate",
        lr.end_date::text as "endDate",
        lr.start_time::text as "startTime",
        lr.end_time::text as "endTime",
        lr.is_half_day_start as "isHalfDayStart",
        lr.is_half_day_end as "isHalfDayEnd",
        lr.status, lr.reason, lr.manager_comment as "managerComment",
        lr.approved_by as "approvedBy",
        lr.approved_at as "approvedAt",
        lr.computed_hours as "computedHours",
        lr.attachment_url as "attachmentUrl",
        lr.created_at as "createdAt",
        lr.updated_at as "updatedAt"
      FROM leave_requests lr
      LEFT JOIN users u ON lr.user_id = u.id
      WHERE ${conditions.join(" AND ")}
      ORDER BY lr.start_date DESC, lr.created_at DESC
    `;

  const requests = await queryRows<LeaveRequest>(query, values);

  const currentYear = new Date().getFullYear();
  const bookedRows = await queryRows<{ userId: string; total: number }>(
    `
      SELECT user_id as "userId",
        COALESCE(SUM(computed_hours), 0) as total
      FROM leave_requests
      WHERE type = 'ANNUAL_LEAVE'
        AND status IN ('PENDING', 'APPROVED')
        AND EXTRACT(YEAR FROM start_date) = $1
      GROUP BY user_id
    `,
    [currentYear]
  );
  const bookedByUserId = new Map(
    bookedRows.map((row) => [row.userId, Number(row.total ?? 0)])
  );

  const requestsWithBalance = await Promise.all(
    requests.map(async (request) => {
      if (request.type !== "ANNUAL_LEAVE") {
        return {
          ...request,
          currentBalanceHours: null,
          balanceAfterApprovalHours: null,
        };
      }

      const allowanceHours = await getAnnualLeaveAllowanceHoursForUser(request.userId, currentYear);
      const bookedHours = bookedByUserId.get(request.userId) ?? 0;
      const currentBalanceHours = allowanceHours - bookedHours;
      const extraHours = request.status === "PENDING" ? request.computedHours : 0;

      return {
        ...request,
        currentBalanceHours,
        balanceAfterApprovalHours: currentBalanceHours - extraHours,
      };
    })
  );

  res.json({ requests: requestsWithBalance });
}));

app.post("/leave-requests", asyncHandler(async (req, res) => {
  const auth = requireAuth(req.auth ?? null);
  const {
    type,
    startDate,
    endDate,
    startTime,
    endTime,
    isHalfDayStart,
    isHalfDayEnd,
    reason,
    userId,
  } = req.body as {
    type: LeaveType;
    startDate: string;
    endDate: string;
    startTime?: string | null;
    endTime?: string | null;
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
        AND is_active = true
    `,
    [startDate, endDate]
  );

  const holidayDates = new Set(holidayRows.map((h) => h.date));
  const computedHours = computeWorkingHours(
    startDate,
    endDate,
    isHalfDayStart ?? false,
    isHalfDayEnd ?? false,
    holidayDates,
    startTime ?? null,
    endTime ?? null
  );

  const result = await queryRow<{ id: number }>(
    `
      INSERT INTO leave_requests (
        user_id, type, start_date, end_date, start_time, end_time,
        is_half_day_start, is_half_day_end,
        reason, computed_hours, status,
        created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'DRAFT', NOW(), NOW())
      RETURNING id
    `,
    [
      targetUserId,
      type,
      startDate,
      endDate,
      startTime ?? null,
      endTime ?? null,
      isHalfDayStart ?? false,
      isHalfDayEnd ?? false,
      reason ?? null,
      computedHours,
    ]
  );

  const leaveRequest = await queryRow<LeaveRequest>(
    `
      SELECT 
        id, user_id as "userId", type,
        start_date::text as "startDate",
        end_date::text as "endDate",
        start_time::text as "startTime",
        end_time::text as "endTime",
        is_half_day_start as "isHalfDayStart",
        is_half_day_end as "isHalfDayEnd",
        status, reason, manager_comment as "managerComment",
        approved_by as "approvedBy",
        approved_at as "approvedAt",
        computed_hours as "computedHours",
        attachment_url as "attachmentUrl",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM leave_requests
      WHERE id = $1
    `,
    [result?.id]
  );

  await createEntityAuditLog(
    auth.userID,
    "leave_request",
    leaveRequest!.id,
    "CREATE",
    null,
    leaveRequest as unknown as Record<string, unknown>
  );

  res.json(leaveRequest);
}));

app.patch("/leave-requests/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req.auth ?? null);
  const id = Number(req.params.id);
  const {
    type,
    startDate,
    endDate,
    startTime,
    endTime,
    isHalfDayStart,
    isHalfDayEnd,
    reason,
    managerComment,
  } = req.body as {
    type?: LeaveType;
    startDate?: string;
    endDate?: string;
    startTime?: string | null;
    endTime?: string | null;
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
        start_time::text as "startTime",
        end_time::text as "endTime",
        is_half_day_start as "isHalfDayStart",
        is_half_day_end as "isHalfDayEnd",
        status, reason, manager_comment as "managerComment",
        approved_by as "approvedBy",
        approved_at as "approvedAt",
        computed_hours as "computedHours",
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

  let computedHours = before.computedHours;
  if (
    startDate ||
    endDate ||
    isHalfDayStart !== undefined ||
    isHalfDayEnd !== undefined ||
    startTime !== undefined ||
    endTime !== undefined
  ) {
    const holidayRows = await queryRows<{ date: string }>(
      `
        SELECT date::text as date FROM holidays
        WHERE date >= $1 AND date <= $2
          AND is_active = true
      `,
      [newStartDate, newEndDate]
    );

    const holidayDates = new Set(holidayRows.map((h) => h.date));
    computedHours = computeWorkingHours(
      newStartDate,
      newEndDate,
      isHalfDayStart ?? before.isHalfDayStart,
      isHalfDayEnd ?? before.isHalfDayEnd,
      holidayDates,
      startTime ?? before.startTime,
      endTime ?? before.endTime
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
  if (startTime !== undefined) {
    updates.push(`start_time = $${values.length + 1}`);
    values.push(startTime || null);
  }
  if (endTime !== undefined) {
    updates.push(`end_time = $${values.length + 1}`);
    values.push(endTime || null);
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
  if (computedHours !== before.computedHours) {
    updates.push(`computed_hours = $${values.length + 1}`);
    values.push(computedHours);
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
        start_time::text as "startTime",
        end_time::text as "endTime",
        is_half_day_start as "isHalfDayStart",
        is_half_day_end as "isHalfDayEnd",
        status, reason, manager_comment as "managerComment",
        approved_by as "approvedBy",
        approved_at as "approvedAt",
        computed_hours as "computedHours",
        attachment_url as "attachmentUrl",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM leave_requests
      WHERE id = $1
    `,
    [id]
  );

  await createEntityAuditLog(
    auth.userID,
    "leave_request",
    id,
    "UPDATE",
    before as unknown as Record<string, unknown>,
    after as unknown as Record<string, unknown>
  );

  if (auth.role === "MANAGER" && before.userId !== auth.userID) {
    await createNotification(
      before.userId,
      "REQUEST_UPDATED_BY_MANAGER",
      {
        requestId: id,
        updatedBy: auth.userID,
        startDate: after?.startDate,
        endDate: after?.endDate,
        status: after?.status,
      },
      `leave_request:${id}:manager-update:${after?.updatedAt}`
    );
  }

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
        start_time::text as "startTime",
        end_time::text as "endTime",
        is_half_day_start as "isHalfDayStart",
        is_half_day_end as "isHalfDayEnd",
        status, reason, manager_comment as "managerComment",
        approved_by as "approvedBy",
        approved_at as "approvedAt",
        computed_hours as "computedHours",
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

  await createEntityAuditLog(
    auth.userID,
    "leave_request",
    id,
    "DELETE",
    request as unknown as Record<string, unknown>,
    null
  );

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
        start_time::text as "startTime",
        end_time::text as "endTime",
        is_half_day_start as "isHalfDayStart",
        is_half_day_end as "isHalfDayEnd",
        status, reason, manager_comment as "managerComment",
        approved_by as "approvedBy",
        approved_at as "approvedAt",
        computed_hours as "computedHours",
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
        start_time::text as "startTime",
        end_time::text as "endTime",
        is_half_day_start as "isHalfDayStart",
        is_half_day_end as "isHalfDayEnd",
        status, reason, manager_comment as "managerComment",
        approved_by as "approvedBy",
        approved_at as "approvedAt",
        computed_hours as "computedHours",
        attachment_url as "attachmentUrl",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM leave_requests
      WHERE id = $1
    `,
    [id]
  );

  await createEntityAuditLog(
    auth.userID,
    "leave_request",
    id,
    "SUBMIT",
    request as unknown as Record<string, unknown>,
    updated as unknown as Record<string, unknown>
  );

  const requester = await queryRow<{ teamId: number | null; name: string }>(
    "SELECT team_id as \"teamId\", name FROM users WHERE id = $1",
    [request.userId]
  );

  const managers = requester?.teamId
    ? await queryRows<{ id: string }>(
        "SELECT id FROM users WHERE role = 'MANAGER' AND is_active = true AND team_id = $1",
        [requester.teamId]
      )
    : await queryRows<{ id: string }>(
        "SELECT id FROM users WHERE role = 'MANAGER' AND is_active = true",
        []
      );

  for (const manager of managers) {
    await createNotification(
      manager.id,
      "NEW_PENDING_REQUEST",
      {
        requestId: id,
        userId: request.userId,
        userName: requester?.name,
        startDate: updated?.startDate,
        endDate: updated?.endDate,
      },
      `leave_request:${id}:submitted:${manager.id}`
    );
  }

  res.json(updated);
}));

app.post("/leave-requests/:id/approve", asyncHandler(async (req, res) => {
  const auth = requireAuth(req.auth ?? null);
  requireManager(auth.role);
  const id = Number(req.params.id);
  const { comment, bulk } = req.body as { comment?: string; bulk?: boolean };

  const request = await queryRow<LeaveRequest & { teamId: number | null }>(
    `
      SELECT 
        lr.id, lr.user_id as "userId", lr.type,
        lr.start_date::text as "startDate",
        lr.end_date::text as "endDate",
        lr.start_time::text as "startTime",
        lr.end_time::text as "endTime",
        lr.is_half_day_start as "isHalfDayStart",
        lr.is_half_day_end as "isHalfDayEnd",
        lr.status, lr.reason, lr.manager_comment as "managerComment",
        lr.approved_by as "approvedBy",
        lr.approved_at as "approvedAt",
        lr.computed_hours as "computedHours",
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
        start_time::text as "startTime",
        end_time::text as "endTime",
        is_half_day_start as "isHalfDayStart",
        is_half_day_end as "isHalfDayEnd",
        status, reason, manager_comment as "managerComment",
        approved_by as "approvedBy",
        approved_at as "approvedAt",
        computed_hours as "computedHours",
        attachment_url as "attachmentUrl",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM leave_requests
      WHERE id = $1
    `,
    [id]
  );

  await createEntityAuditLog(
    auth.userID,
    "leave_request",
    id,
    bulk ? "BULK_APPROVE" : "APPROVE",
    request as unknown as Record<string, unknown>,
    updated as unknown as Record<string, unknown>
  );

  await createNotification(
    request.userId,
    "REQUEST_APPROVED",
    { requestId: id, startDate: updated?.startDate, endDate: updated?.endDate },
    `leave_request:${id}:approved`
  );

  res.json(updated);
}));

app.post("/leave-requests/:id/reject", asyncHandler(async (req, res) => {
  const auth = requireAuth(req.auth ?? null);
  requireManager(auth.role);
  const id = Number(req.params.id);
  const { comment, bulk } = req.body as { comment: string; bulk?: boolean };

  const request = await queryRow<LeaveRequest>(
    `
      SELECT 
        id, user_id as "userId", type,
        start_date::text as "startDate",
        end_date::text as "endDate",
        start_time::text as "startTime",
        end_time::text as "endTime",
        is_half_day_start as "isHalfDayStart",
        is_half_day_end as "isHalfDayEnd",
        status, reason, manager_comment as "managerComment",
        approved_by as "approvedBy",
        approved_at as "approvedAt",
        computed_hours as "computedHours",
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
        start_time::text as "startTime",
        end_time::text as "endTime",
        is_half_day_start as "isHalfDayStart",
        is_half_day_end as "isHalfDayEnd",
        status, reason, manager_comment as "managerComment",
        approved_by as "approvedBy",
        approved_at as "approvedAt",
        computed_hours as "computedHours",
        attachment_url as "attachmentUrl",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM leave_requests
      WHERE id = $1
    `,
    [id]
  );

  await createEntityAuditLog(
    auth.userID,
    "leave_request",
    id,
    bulk ? "BULK_REJECT" : "REJECT",
    request as unknown as Record<string, unknown>,
    updated as unknown as Record<string, unknown>
  );

  await createNotification(
    request.userId,
    "REQUEST_REJECTED",
    { requestId: id, startDate: updated?.startDate, endDate: updated?.endDate },
    `leave_request:${id}:rejected`
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
        start_time::text as "startTime",
        end_time::text as "endTime",
        is_half_day_start as "isHalfDayStart",
        is_half_day_end as "isHalfDayEnd",
        status, reason, manager_comment as "managerComment",
        approved_by as "approvedBy",
        approved_at as "approvedAt",
        computed_hours as "computedHours",
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
        start_time::text as "startTime",
        end_time::text as "endTime",
        is_half_day_start as "isHalfDayStart",
        is_half_day_end as "isHalfDayEnd",
        status, reason, manager_comment as "managerComment",
        approved_by as "approvedBy",
        approved_at as "approvedAt",
        computed_hours as "computedHours",
        attachment_url as "attachmentUrl",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM leave_requests
      WHERE id = $1
    `,
    [id]
  );

  await createEntityAuditLog(
    auth.userID,
    "leave_request",
    id,
    "CANCEL",
    request as unknown as Record<string, unknown>,
    updated as unknown as Record<string, unknown>
  );

  const requester = await queryRow<{ teamId: number | null; name: string }>(
    "SELECT team_id as \"teamId\", name FROM users WHERE id = $1",
    [request.userId]
  );

  const managers = requester?.teamId
    ? await queryRows<{ id: string }>(
        "SELECT id FROM users WHERE role = 'MANAGER' AND is_active = true AND team_id = $1",
        [requester.teamId]
      )
    : await queryRows<{ id: string }>(
        "SELECT id FROM users WHERE role = 'MANAGER' AND is_active = true",
        []
      );

  for (const manager of managers) {
    await createNotification(
      manager.id,
      "REQUEST_CANCELLED",
      {
        requestId: id,
        userId: request.userId,
        userName: requester?.name,
        startDate: updated?.startDate,
        endDate: updated?.endDate,
      },
      `leave_request:${id}:cancelled:${manager.id}`
    );
  }

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
  const showTeamCalendarForEmployees = await getShowTeamCalendarForEmployees();

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
        lr.start_time::text as "startTime",
        lr.end_time::text as "endTime",
        lr.is_half_day_start as "isHalfDayStart",
        lr.is_half_day_end as "isHalfDayEnd",
        lr.status, lr.reason, lr.manager_comment as "managerComment",
        lr.approved_by as "approvedBy",
        lr.approved_at as "approvedAt",
        lr.computed_hours as "computedHours",
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
  const isManager = auth.role === "MANAGER";
  const entityType = req.query.entityType as string | undefined;
  const entityId = req.query.entityId as string | undefined;
  const limit = req.query.limit ? Number(req.query.limit) : 100;

  if (!isManager) {
    if (entityType !== "leave_request" || !entityId) {
      throw new HttpError(403, "Not allowed to view audit logs");
    }
    const owned = await queryRow<{ id: number }>(
      "SELECT id FROM leave_requests WHERE id = $1 AND user_id = $2",
      [Number(entityId), auth.userID]
    );
    if (!owned) {
      throw new HttpError(403, "Not allowed to view audit logs");
    }
  }

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

  const logs = await queryRows<AuditLog>(query, values);
  res.json({ logs });
}));

app.get("/notifications", asyncHandler(async (req, res) => {
  const auth = requireAuth(req.auth ?? null);
  const supportsDedupeKey = await hasNotificationsDedupeKey();
  const dedupeSelect = supportsDedupeKey ? `, dedupe_key as "dedupeKey"` : "";
  const notifications = await queryRows<Notification>(
    `
      SELECT 
        id,
        user_id as "userId",
        type,
        payload_json as "payloadJson",
        sent_at as "sentAt",
        read_at as "readAt",
        created_at as "createdAt"
        ${dedupeSelect}
      FROM notifications
      WHERE user_id = $1
      ORDER BY (read_at IS NULL) DESC, created_at DESC
      LIMIT 50
    `,
    [auth.userID]
  );

  res.json({ notifications });
}));

app.post("/notifications/:id/read", asyncHandler(async (req, res) => {
  const auth = requireAuth(req.auth ?? null);
  const id = Number(req.params.id);
  await pool.query(
    "UPDATE notifications SET read_at = NOW() WHERE id = $1 AND user_id = $2",
    [id, auth.userID]
  );
  res.json({ ok: true });
}));

app.post("/notifications/read-all", asyncHandler(async (req, res) => {
  const auth = requireAuth(req.auth ?? null);
  await pool.query(
    "UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL",
    [auth.userID]
  );
  res.json({ ok: true });
}));

app.get("/admin/vacation-policy", asyncHandler(async (req, res) => {
  const auth = requireAuth(req.auth ?? null);
  requireManager(auth.role);

  const policy = await getVacationPolicy();
  res.json({ policy });
}));

app.patch("/admin/vacation-policy", asyncHandler(async (req, res) => {
  const auth = requireAuth(req.auth ?? null);
  requireManager(auth.role);

  const policySupport = await getVacationPolicySupport();
  if (!policySupport.hasPolicyColumns) {
    throw new HttpError(409, "Vacation policy settings are unavailable. Run database migrations.");
  }

  const before = await getVacationPolicy();
  const payload = req.body as Partial<VacationPolicy>;
  const accrualPolicy = payload.accrualPolicy ?? before.accrualPolicy;
  const carryOverEnabled =
    typeof payload.carryOverEnabled === "boolean" ? payload.carryOverEnabled : before.carryOverEnabled;
  const carryOverLimitHours =
    typeof payload.carryOverLimitHours === "number" ? payload.carryOverLimitHours : before.carryOverLimitHours;

  if (!["YEAR_START", "PRO_RATA"].includes(accrualPolicy)) {
    throw new HttpError(400, "Invalid accrual policy.");
  }

  if (Number.isNaN(carryOverLimitHours) || carryOverLimitHours < 0) {
    throw new HttpError(400, "Carry-over limit must be a non-negative number.");
  }

  const updated = await queryRow<VacationPolicy>(
    `
      UPDATE settings
      SET annual_leave_accrual_policy = $1,
          carry_over_enabled = $2,
          carry_over_limit_hours = $3,
          updated_at = NOW()
      WHERE id = 1
      RETURNING
        annual_leave_accrual_policy as "accrualPolicy",
        carry_over_enabled as "carryOverEnabled",
        carry_over_limit_hours as "carryOverLimitHours"
    `,
    [accrualPolicy, carryOverEnabled, carryOverLimitHours]
  );

  if (!updated) {
    throw new HttpError(500, "Failed to update vacation policy.");
  }

  await createEntityAuditLog(auth.userID, "settings", 1, "UPDATE", before, updated);

  res.json({ policy: updated });
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
    settings: await queryRows<Record<string, unknown>>("SELECT * FROM settings ORDER BY id ASC"),
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
    "settings",
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
      "TRUNCATE teams, users, leave_requests, holidays, leave_balances, settings, audit_logs, notifications RESTART IDENTITY CASCADE"
    );

    await insertRows(client, "teams", backup.tables.teams);
    await insertRows(client, "users", backup.tables.users);
    await insertRows(client, "holidays", backup.tables.holidays);
    await insertRows(client, "leave_balances", backup.tables.leave_balances);
    await insertRows(client, "leave_requests", backup.tables.leave_requests);
    await insertRows(client, "settings", backup.tables.settings);
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
  await pool.query(`
    ALTER TABLE leave_requests
    ADD COLUMN IF NOT EXISTS start_time TIME,
    ADD COLUMN IF NOT EXISTS end_time TIME
  `);
  await pool.query(`
    ALTER TABLE holidays
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_holidays_active ON holidays(is_active)
  `);
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
