import type { NextRequest, NextResponse } from "next/server";
import type { WidgetResultApi } from "@/lib/api/types";
import { appConfig } from "@/lib/config/appConfig";
import { defaultSymbols, phase2Symbols } from "@/lib/config/symbols";
import { getDatabase } from "@/lib/db/client";
import { initializeDatabase } from "@/lib/db/initialize";
import {
  createSession,
  createUser,
  deleteExpiredSessions,
  deleteSessionByToken,
  findUserByEmail,
  getSessionContextByToken
} from "@/lib/db/repositories/accountRepository";
import type { UserRecord, UserRole } from "@/lib/db/types";
import { defaultVisibleWidgetIdsForPlan, sortByWidgetPriority } from "@/lib/widgets/catalog";
import { hashPassword, normalizeEmail, verifyPassword } from "./password";

export type AccessPlan = "basic" | "enterprise";

export interface AuthSession {
  isAdmin: boolean;
  plan: AccessPlan;
  username: string | null;
  userId: number | null;
  email: string | null;
  role: UserRole | "anonymous";
  accessibleSymbols: string[];
  lockedSymbols: string[];
  visibleWidgetIds: string[];
}

export const AUTH_COOKIE_NAME = "laripulse_session";
const LEGACY_AUTH_COOKIE_NAME = "laripulse_admin";
const allConfiguredSymbolIds = [...defaultSymbols, ...phase2Symbols].map((symbol) => symbol.symbol);

export const basicSymbolIds = ["BTCUSDT"] as const;
export const lockedBasicSymbolIds = allConfiguredSymbolIds.filter((symbol) => !basicSymbolIds.includes(symbol as typeof basicSymbolIds[number]));
export const basicWidgetIds = defaultVisibleWidgetIdsForPlan("basic");
export const enterpriseWidgetIds = defaultVisibleWidgetIdsForPlan("enterprise");

class AuthInputError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "AuthInputError";
    this.statusCode = statusCode;
  }
}

function initializedDatabase() {
  initializeDatabase();
  return getDatabase();
}

export function anonymousSession(): AuthSession {
  return {
    isAdmin: false,
    plan: "basic",
    username: null,
    userId: null,
    email: null,
    role: "anonymous",
    accessibleSymbols: [...basicSymbolIds],
    lockedSymbols: [...lockedBasicSymbolIds],
    visibleWidgetIds: basicWidgetIds
  };
}

function sessionForUser(user: UserRecord): AuthSession {
  if (user.role === "admin") {
    return {
      ...createAdminSession(user.email),
      userId: user.id
    };
  }

  return {
    ...anonymousSession(),
    username: user.email,
    userId: user.id,
    email: user.email,
    role: user.role
  };
}

export function getSessionFromToken(token: string | undefined): AuthSession {
  if (!token) {
    return anonymousSession();
  }

  const db = initializedDatabase();
  deleteExpiredSessions(db);
  const context = getSessionContextByToken(db, token);

  return context ? sessionForUser(context.user) : anonymousSession();
}

export function createAdminSession(username = appConfig.adminEmail): AuthSession {
  return {
    isAdmin: true,
    plan: "enterprise",
    username,
    userId: null,
    email: normalizeEmail(username),
    role: "admin",
    accessibleSymbols: allConfiguredSymbolIds,
    lockedSymbols: [],
    visibleWidgetIds: enterpriseWidgetIds
  };
}

export function getSessionFromRequest(request: NextRequest) {
  return getSessionFromToken(request.cookies.get(AUTH_COOKIE_NAME)?.value);
}

export function setSessionCookie(response: NextResponse, token: string, expiresAt: string) {
  response.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt),
    secure: process.env.NODE_ENV === "production"
  });
  response.cookies.set(LEGACY_AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    secure: process.env.NODE_ENV === "production"
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    secure: process.env.NODE_ENV === "production"
  });
  response.cookies.set(LEGACY_AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    secure: process.env.NODE_ENV === "production"
  });
}

export function clearSessionForToken(token: string | undefined) {
  if (!token) {
    return;
  }

  deleteSessionByToken(initializedDatabase(), token);
}

export function registerAccount(input: { email: string; password: string }) {
  const email = normalizeEmail(input.email);

  if (!email.includes("@") || email.length > 254) {
    throw new AuthInputError("A valid email address is required");
  }

  if (input.password.length < 8) {
    throw new AuthInputError("Password must be at least 8 characters");
  }

  const db = initializedDatabase();

  if (findUserByEmail(db, email)) {
    throw new AuthInputError("An account already exists for this email", 409);
  }

  return createUser(db, {
    email,
    passwordHash: hashPassword(input.password),
    role: "user",
    status: "active",
    emailVerifiedAt: null
  });
}

export function authenticateAccount(input: { email: string; password: string }) {
  const db = initializedDatabase();
  const user = findUserByEmail(db, input.email);

  if (!user || user.status !== "active" || !verifyPassword(input.password, user.passwordHash)) {
    return null;
  }

  return user;
}

export function createAuthenticatedSession(input: {
  userId: number;
  userAgent?: string | null;
  ipAddress?: string | null;
}) {
  return createSession(initializedDatabase(), {
    userId: input.userId,
    maxAgeSeconds: appConfig.sessionMaxAgeSeconds,
    userAgent: input.userAgent,
    ipAddress: input.ipAddress
  });
}

export function canAccessSymbol(session: AuthSession, symbol: string) {
  return session.accessibleSymbols.includes(symbol);
}

export function filterVisibleWidgets<T extends { widgetId: string }>(widgets: T[], session: AuthSession) {
  const allowed = new Set(session.visibleWidgetIds);
  return sortByWidgetPriority(widgets.filter((widget) => allowed.has(widget.widgetId)));
}

export function filterVisibleWidgetResults(widgets: WidgetResultApi[], session: AuthSession) {
  return filterVisibleWidgets(widgets, session);
}

export function authSessionApi(session: AuthSession) {
  return {
    isAdmin: session.isAdmin,
    plan: session.plan,
    username: session.username,
    userId: session.userId,
    email: session.email,
    role: session.role,
    accessibleSymbols: session.accessibleSymbols,
    lockedSymbols: session.lockedSymbols,
    visibleWidgetIds: session.visibleWidgetIds
  };
}
