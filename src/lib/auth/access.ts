import type Database from "better-sqlite3";
import type { NextRequest, NextResponse } from "next/server";
import type { AuthSessionApi, WidgetResultApi } from "@/lib/api/types";
import { appConfig } from "@/lib/config/appConfig";
import { crossMarketSymbols, defaultSymbols } from "@/lib/config/symbols";
import { getDatabase } from "@/lib/db/client";
import { initializeDatabase } from "@/lib/db/initialize";
import {
  createSession,
  deleteExpiredSessions,
  deleteSessionByToken,
  findUserByEmail,
  getSessionContextByToken
} from "@/lib/db/repositories/accountRepository";
import { getAppSettings } from "@/lib/db/repositories/appSettingsRepository";
import { listWidgetSettings } from "@/lib/db/repositories/widgetSettingsRepository";
import type { UserRecord, UserRole } from "@/lib/db/types";
import { sortByWidgetPriority, widgetCatalog } from "@/lib/widgets/catalog";
import { hashPassword, verifyPassword } from "./password";

export type { UserRole };

export interface AuthSession {
  userId: number | null;
  email: string | null;
  /** null means an anonymous visitor on an instance without a public dashboard. */
  role: UserRole | null;
  isAuthenticated: boolean;
  accessibleSymbols: string[];
  visibleWidgetIds: string[];
}

export const AUTH_COOKIE_NAME = "laripulse_session";
export const userRoles: readonly UserRole[] = ["viewer", "analyst", "admin"];

const roleRank: Record<UserRole, number> = {
  viewer: 1,
  analyst: 2,
  admin: 3
};

const configuredSymbolIds = [...defaultSymbols, ...crossMarketSymbols].map((symbol) => symbol.symbol);

export class AccessError extends Error {
  readonly statusCode: 401 | 403;

  constructor(message: string, statusCode: 401 | 403) {
    super(message);
    this.name = "AccessError";
    this.statusCode = statusCode;
  }
}

function initializedDatabase() {
  initializeDatabase();
  return getDatabase();
}

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && (userRoles as readonly string[]).includes(value);
}

/**
 * Widgets are enabled instance-wide by an admin. A widget without a stored
 * setting falls back to its catalog default.
 */
export function resolveVisibleWidgetIds(db: Database.Database): string[] {
  const persisted = new Map(listWidgetSettings(db).map((setting) => [setting.widgetId, setting.isEnabled]));
  const visible = widgetCatalog
    .filter((item) => persisted.get(item.widgetId) ?? item.defaultEnabled)
    .map((item) => ({ widgetId: item.widgetId }));

  return sortByWidgetPriority(visible).map((item) => item.widgetId);
}

function buildSession(db: Database.Database, user: UserRecord | null): AuthSession {
  const role = user ? user.role : getAppSettings(db).publicDashboard ? "viewer" : null;

  return {
    userId: user?.id ?? null,
    email: user?.email ?? null,
    role,
    isAuthenticated: user !== null,
    accessibleSymbols: role ? configuredSymbolIds : [],
    visibleWidgetIds: role ? resolveVisibleWidgetIds(db) : []
  };
}

export function getSessionFromToken(token: string | undefined, db?: Database.Database): AuthSession {
  const database = db ?? initializedDatabase();

  if (!token) {
    return buildSession(database, null);
  }

  deleteExpiredSessions(database);
  const context = getSessionContextByToken(database, token);

  return buildSession(database, context?.user ?? null);
}

export function getSessionFromRequest(request: NextRequest) {
  return getSessionFromToken(request.cookies.get(AUTH_COOKIE_NAME)?.value);
}

export function hasRole(session: AuthSession, minimum: UserRole) {
  return session.role !== null && roleRank[session.role] >= roleRank[minimum];
}

/**
 * Throws 401 when the visitor must sign in and 403 when a signed-in user's
 * role is below the required one.
 */
export function requireRole(session: AuthSession, minimum: UserRole) {
  if (hasRole(session, minimum)) {
    return session;
  }

  if (!session.isAuthenticated) {
    throw new AccessError("Sign in required", 401);
  }

  throw new AccessError(`This action requires the ${minimum} role`, 403);
}

/** Narrows a session to a signed-in user with at least the given role. */
export function requireUser(session: AuthSession, minimum: UserRole = "viewer") {
  requireRole(session, minimum);

  if (session.userId === null || session.email === null || session.role === null) {
    throw new AccessError("Sign in required", 401);
  }

  return session as AuthSession & { userId: number; email: string; role: UserRole };
}

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production"
};

export function setSessionCookie(response: NextResponse, token: string, expiresAt: string) {
  response.cookies.set(AUTH_COOKIE_NAME, token, {
    ...cookieOptions,
    expires: new Date(expiresAt)
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(AUTH_COOKIE_NAME, "", {
    ...cookieOptions,
    maxAge: 0
  });
}

export function clearSessionForToken(token: string | undefined) {
  if (!token) {
    return;
  }

  deleteSessionByToken(initializedDatabase(), token);
}

let timingHash: string | null = null;

export function authenticateAccount(input: { email: string; password: string }, db?: Database.Database) {
  const database = db ?? initializedDatabase();
  const user = findUserByEmail(database, input.email);

  if (!user) {
    // Spend the same scrypt cost as a real check so response time does not reveal whether the email exists.
    timingHash ??= hashPassword("laripulse-timing-guard");
    verifyPassword(input.password, timingHash);
    return null;
  }

  if (user.status !== "active" || !verifyPassword(input.password, user.passwordHash)) {
    return null;
  }

  return user;
}

export function createAuthenticatedSession(
  input: {
    userId: number;
    userAgent?: string | null;
    ipAddress?: string | null;
  },
  db?: Database.Database
) {
  return createSession(db ?? initializedDatabase(), {
    userId: input.userId,
    maxAgeSeconds: appConfig.sessionMaxAgeSeconds,
    userAgent: input.userAgent,
    ipAddress: input.ipAddress
  });
}

export function canAccessSymbol(session: AuthSession, symbol: string) {
  return session.accessibleSymbols.includes(symbol);
}

export function filterVisibleWidgets<T extends { widgetId: string }>(
  widgets: T[],
  session: Pick<AuthSession, "visibleWidgetIds">
) {
  const allowed = new Set(session.visibleWidgetIds);
  return sortByWidgetPriority(widgets.filter((widget) => allowed.has(widget.widgetId)));
}

export function filterVisibleWidgetResults(widgets: WidgetResultApi[], session: Pick<AuthSession, "visibleWidgetIds">) {
  return filterVisibleWidgets(widgets, session);
}

export function authSessionApi(session: AuthSession): AuthSessionApi {
  return {
    userId: session.userId,
    email: session.email,
    role: session.role,
    isAuthenticated: session.isAuthenticated,
    accessibleSymbols: session.accessibleSymbols,
    visibleWidgetIds: session.visibleWidgetIds
  };
}
