import crypto from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import type { WidgetResultApi } from "@/lib/api/types";
import { defaultSymbols, phase2Symbols } from "@/lib/config/symbols";
import { defaultVisibleWidgetIdsForPlan, sortByWidgetPriority } from "@/lib/widgets/catalog";

export type AccessPlan = "basic" | "enterprise";

export interface AuthSession {
  isAdmin: boolean;
  plan: AccessPlan;
  username: string | null;
  accessibleSymbols: string[];
  lockedSymbols: string[];
  visibleWidgetIds: string[];
}

export const AUTH_COOKIE_NAME = "laripulse_admin";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const ADMIN_USERNAME = process.env.LARIPULSE_ADMIN_USERNAME ?? "admin";
const ADMIN_PASSWORD = process.env.LARIPULSE_ADMIN_PASSWORD ?? "123";
const AUTH_SECRET = process.env.LARIPULSE_AUTH_SECRET ?? "laripulse-local-dev-secret";
const allConfiguredSymbolIds = [...defaultSymbols, ...phase2Symbols].map((symbol) => symbol.symbol);

export const basicSymbolIds = ["BTCUSDT"] as const;
export const lockedBasicSymbolIds = allConfiguredSymbolIds.filter((symbol) => !basicSymbolIds.includes(symbol as typeof basicSymbolIds[number]));
export const basicWidgetIds = defaultVisibleWidgetIdsForPlan("basic");
export const enterpriseWidgetIds = defaultVisibleWidgetIdsForPlan("enterprise");

function sign(value: string) {
  return crypto.createHmac("sha256", AUTH_SECRET).update(value).digest("hex");
}

function createToken(username: string) {
  return `${username}.${sign(username)}`;
}

function verifyToken(token: string | undefined) {
  if (!token) {
    return null;
  }

  const [username, signature] = token.split(".");

  if (!username || !signature) {
    return null;
  }

  const expected = sign(username);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== actualBuffer.length) {
    return null;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer) ? username : null;
}

export function authenticateAdmin(input: { username: string; password: string }) {
  return input.username === ADMIN_USERNAME && input.password === ADMIN_PASSWORD;
}

export function getSessionFromToken(token: string | undefined): AuthSession {
  const username = verifyToken(token);

  if (username === ADMIN_USERNAME) {
    return createAdminSession(username);
  }

  return {
    isAdmin: false,
    plan: "basic",
    username: null,
    accessibleSymbols: [...basicSymbolIds],
    lockedSymbols: [...lockedBasicSymbolIds],
    visibleWidgetIds: basicWidgetIds
  };
}

export function createAdminSession(username = ADMIN_USERNAME): AuthSession {
  return {
    isAdmin: true,
    plan: "enterprise",
    username,
    accessibleSymbols: allConfiguredSymbolIds,
    lockedSymbols: [],
    visibleWidgetIds: enterpriseWidgetIds
  };
}

export function getSessionFromRequest(request: NextRequest) {
  return getSessionFromToken(request.cookies.get(AUTH_COOKIE_NAME)?.value);
}

export function setAdminCookie(response: NextResponse, username = ADMIN_USERNAME) {
  response.cookies.set(AUTH_COOKIE_NAME, createToken(username), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === "production"
  });
}

export function clearAdminCookie(response: NextResponse) {
  response.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    secure: process.env.NODE_ENV === "production"
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
    accessibleSymbols: session.accessibleSymbols,
    lockedSymbols: session.lockedSymbols,
    visibleWidgetIds: session.visibleWidgetIds
  };
}
