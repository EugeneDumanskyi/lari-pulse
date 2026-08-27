import crypto from "node:crypto";
import type Database from "better-sqlite3";
import type { InviteRecord, NewUser, SessionRecord, UserRecord, UserRole, UserStatus } from "../types";
import { appConfig } from "@/lib/config/appConfig";
import { hashPassword, normalizeEmail } from "@/lib/auth/password";

interface UserDbRow {
  id: number;
  email: string;
  password_hash: string;
  role: UserRole;
  status: UserStatus;
  email_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SessionDbRow {
  id: number;
  user_id: number;
  token_hash: string;
  expires_at: string;
  user_agent: string | null;
  ip_address: string | null;
  created_at: string;
  updated_at: string;
}

interface InviteDbRow {
  id: number;
  token_hash: string;
  role: UserRole;
  email: string | null;
  created_by: number | null;
  expires_at: string;
  used_at: string | null;
  used_by: number | null;
  created_at: string;
}

export interface SessionContextRecord {
  user: UserRecord;
  session: SessionRecord;
}

function mapUser(row: UserDbRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    status: row.status,
    emailVerifiedAt: row.email_verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapSession(row: SessionDbRow): SessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    userAgent: row.user_agent,
    ipAddress: row.ip_address,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapInvite(row: InviteDbRow): InviteRecord {
  return {
    id: row.id,
    tokenHash: row.token_hash,
    role: row.role,
    email: row.email,
    createdBy: row.created_by,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    usedBy: row.used_by,
    createdAt: row.created_at
  };
}

function tokenHash(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function newToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function findUserByEmail(db: Database.Database, email: string) {
  const row = db
    .prepare(
      `
      SELECT *
      FROM users
      WHERE email = @email
      LIMIT 1
    `
    )
    .get({ email: normalizeEmail(email) }) as UserDbRow | undefined;

  return row ? mapUser(row) : null;
}

export function findUserById(db: Database.Database, id: number) {
  const row = db
    .prepare(
      `
      SELECT *
      FROM users
      WHERE id = @id
      LIMIT 1
    `
    )
    .get({ id }) as UserDbRow | undefined;

  return row ? mapUser(row) : null;
}

export function createUser(db: Database.Database, input: NewUser) {
  const result = db
    .prepare(
      `
      INSERT INTO users (email, password_hash, role, status, email_verified_at, updated_at)
      VALUES (@email, @passwordHash, @role, @status, @emailVerifiedAt, datetime('now'))
    `
    )
    .run({
      email: normalizeEmail(input.email),
      passwordHash: input.passwordHash,
      role: input.role,
      status: input.status,
      emailVerifiedAt: input.emailVerifiedAt ?? null
    });

  const user = findUserById(db, Number(result.lastInsertRowid));

  if (!user) {
    throw new Error("Unable to create user");
  }

  return user;
}

export function createSession(
  db: Database.Database,
  input: { userId: number; maxAgeSeconds: number; userAgent?: string | null; ipAddress?: string | null }
) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + input.maxAgeSeconds * 1000).toISOString();

  db.prepare(
    `
    INSERT INTO sessions (user_id, token_hash, expires_at, user_agent, ip_address, updated_at)
    VALUES (@userId, @tokenHash, @expiresAt, @userAgent, @ipAddress, datetime('now'))
  `
  ).run({
    userId: input.userId,
    tokenHash: tokenHash(token),
    expiresAt,
    userAgent: input.userAgent ?? null,
    ipAddress: input.ipAddress ?? null
  });

  return { token, expiresAt };
}

export function deleteSessionByToken(db: Database.Database, token: string | undefined) {
  if (!token) {
    return;
  }

  db.prepare(
    `
    DELETE FROM sessions
    WHERE token_hash = @tokenHash
  `
  ).run({ tokenHash: tokenHash(token) });
}

export function deleteExpiredSessions(db: Database.Database) {
  db.prepare(
    `
    DELETE FROM sessions
    WHERE expires_at <= @now
  `
  ).run({ now: new Date().toISOString() });
}

export function getSessionContextByToken(db: Database.Database, token: string | undefined): SessionContextRecord | null {
  if (!token) {
    return null;
  }

  const row = db
    .prepare(
      `
      SELECT
        s.id AS session_id,
        s.user_id AS session_user_id,
        s.token_hash AS session_token_hash,
        s.expires_at AS session_expires_at,
        s.user_agent AS session_user_agent,
        s.ip_address AS session_ip_address,
        s.created_at AS session_created_at,
        s.updated_at AS session_updated_at,
        u.id AS user_id,
        u.email AS user_email,
        u.password_hash AS user_password_hash,
        u.role AS user_role,
        u.status AS user_status,
        u.email_verified_at AS user_email_verified_at,
        u.created_at AS user_created_at,
        u.updated_at AS user_updated_at
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = @tokenHash
        AND s.expires_at > @now
        AND u.status = 'active'
      LIMIT 1
    `
    )
    .get({ tokenHash: tokenHash(token), now: new Date().toISOString() }) as Record<string, unknown> | undefined;

  if (!row) {
    return null;
  }

  return {
    session: mapSession({
      id: row.session_id as number,
      user_id: row.session_user_id as number,
      token_hash: row.session_token_hash as string,
      expires_at: row.session_expires_at as string,
      user_agent: row.session_user_agent as string | null,
      ip_address: row.session_ip_address as string | null,
      created_at: row.session_created_at as string,
      updated_at: row.session_updated_at as string
    }),
    user: mapUser({
      id: row.user_id as number,
      email: row.user_email as string,
      password_hash: row.user_password_hash as string,
      role: row.user_role as UserRole,
      status: row.user_status as UserStatus,
      email_verified_at: row.user_email_verified_at as string | null,
      created_at: row.user_created_at as string,
      updated_at: row.user_updated_at as string
    })
  };
}

export function countUsers(db: Database.Database) {
  const row = db.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number };
  return row.count;
}

export function countActiveAdmins(db: Database.Database) {
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND status = 'active'")
    .get() as { count: number };
  return row.count;
}

export function listUsers(db: Database.Database) {
  const rows = db.prepare("SELECT * FROM users ORDER BY created_at ASC, id ASC").all() as UserDbRow[];
  return rows.map(mapUser);
}

export function updateUser(
  db: Database.Database,
  id: number,
  patch: { role?: UserRole; status?: UserStatus; passwordHash?: string }
) {
  const current = findUserById(db, id);

  if (!current) {
    return null;
  }

  db.prepare(
    `
    UPDATE users
    SET role = @role,
        status = @status,
        password_hash = @passwordHash,
        updated_at = datetime('now')
    WHERE id = @id
  `
  ).run({
    id,
    role: patch.role ?? current.role,
    status: patch.status ?? current.status,
    passwordHash: patch.passwordHash ?? current.passwordHash
  });

  return findUserById(db, id);
}

export function deleteUser(db: Database.Database, id: number) {
  return db.prepare("DELETE FROM users WHERE id = ?").run(id).changes > 0;
}

export function deleteSessionsForUser(db: Database.Database, userId: number, exceptToken?: string) {
  db.prepare(
    `
    DELETE FROM sessions
    WHERE user_id = @userId
      AND (@exceptHash IS NULL OR token_hash != @exceptHash)
  `
  ).run({ userId, exceptHash: exceptToken ? tokenHash(exceptToken) : null });
}

export function createInvite(
  db: Database.Database,
  input: { role: UserRole; email?: string | null; createdBy: number | null; maxAgeSeconds: number }
) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + input.maxAgeSeconds * 1000).toISOString();
  const result = db
    .prepare(
      `
      INSERT INTO invites (token_hash, role, email, created_by, expires_at)
      VALUES (@tokenHash, @role, @email, @createdBy, @expiresAt)
    `
    )
    .run({
      tokenHash: tokenHash(token),
      role: input.role,
      email: input.email ? normalizeEmail(input.email) : null,
      createdBy: input.createdBy,
      expiresAt
    });
  const row = db.prepare("SELECT * FROM invites WHERE id = ?").get(Number(result.lastInsertRowid)) as InviteDbRow;

  return { token, invite: mapInvite(row) };
}

export function findUsableInvite(db: Database.Database, token: string | undefined) {
  if (!token) {
    return null;
  }

  const row = db
    .prepare(
      `
      SELECT *
      FROM invites
      WHERE token_hash = @tokenHash
        AND used_at IS NULL
        AND expires_at > @now
      LIMIT 1
    `
    )
    .get({ tokenHash: tokenHash(token), now: new Date().toISOString() }) as InviteDbRow | undefined;

  return row ? mapInvite(row) : null;
}

export function markInviteUsed(db: Database.Database, inviteId: number, userId: number) {
  return (
    db
      .prepare(
        `
        UPDATE invites
        SET used_at = datetime('now'),
            used_by = @userId
        WHERE id = @inviteId
          AND used_at IS NULL
      `
      )
      .run({ inviteId, userId }).changes > 0
  );
}

export function listPendingInvites(db: Database.Database) {
  const rows = db
    .prepare(
      `
      SELECT *
      FROM invites
      WHERE used_at IS NULL
        AND expires_at > @now
      ORDER BY created_at DESC, id DESC
    `
    )
    .all({ now: new Date().toISOString() }) as InviteDbRow[];

  return rows.map(mapInvite);
}

export function deleteInvite(db: Database.Database, id: number) {
  return db.prepare("DELETE FROM invites WHERE id = ?").run(id).changes > 0;
}

/**
 * Headless fallback for the first-run setup page: when no users exist yet and
 * LARIPULSE_ADMIN_EMAIL / LARIPULSE_ADMIN_PASSWORD are both set, create that admin.
 */
export function seedAdminUser(db: Database.Database) {
  if (!appConfig.adminEmail || !appConfig.adminPassword || countUsers(db) > 0) {
    return null;
  }

  return createUser(db, {
    email: normalizeEmail(appConfig.adminEmail),
    passwordHash: hashPassword(appConfig.adminPassword),
    role: "admin",
    status: "active",
    emailVerifiedAt: null
  });
}
