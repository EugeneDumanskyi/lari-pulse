import crypto from "node:crypto";
import type Database from "better-sqlite3";
import type { NewUser, SessionRecord, UserRecord } from "../types";
import { appConfig } from "@/lib/config/appConfig";
import { hashPassword, normalizeEmail } from "@/lib/auth/password";

interface UserDbRow {
  id: number;
  email: string;
  password_hash: string;
  role: "user" | "admin";
  status: "active" | "disabled";
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

function tokenHash(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
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
  const token = crypto.randomBytes(32).toString("base64url");
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
      role: row.user_role as "user" | "admin",
      status: row.user_status as "active" | "disabled",
      email_verified_at: row.user_email_verified_at as string | null,
      created_at: row.user_created_at as string,
      updated_at: row.user_updated_at as string
    })
  };
}

export function seedAdminUser(db: Database.Database) {
  const email = normalizeEmail(appConfig.adminEmail);
  const existing = findUserByEmail(db, email);

  if (existing) {
    return existing;
  }

  return createUser(db, {
    email,
    passwordHash: hashPassword(appConfig.adminPassword),
    role: "admin",
    status: "active",
    emailVerifiedAt: new Date().toISOString()
  });
}
