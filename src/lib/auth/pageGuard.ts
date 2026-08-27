import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { AuthSessionApi } from "@/lib/api/types";
import type { UserRole } from "@/lib/db/types";
import { getInstanceStatus } from "@/lib/services/accountService";
import { AUTH_COOKIE_NAME, authSessionApi, getSessionFromToken, hasRole } from "./access";

/**
 * Instance status for the current request. Awaiting connection() keeps the
 * page dynamic, so Next never prerenders a build-time redirect (the build
 * database usually has no users yet).
 */
export async function pageInstanceStatus() {
  await connection();
  return getInstanceStatus();
}

function loginPath(next: string) {
  return `/login?next=${encodeURIComponent(next)}`;
}

/**
 * Server-side gate for app pages. Sends a fresh install to /setup, visitors
 * without access to /login, and signed-in users below the role to /dashboard.
 */
export async function requirePageSession(
  path: string,
  options: { minimumRole?: UserRole; signedIn?: boolean } = {}
): Promise<AuthSessionApi> {
  if ((await pageInstanceStatus()).needsSetup) {
    redirect("/setup");
  }

  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;
  const session = getSessionFromToken(token);
  const minimumRole = options.minimumRole ?? "viewer";

  if (!session.role || (options.signedIn && !session.isAuthenticated)) {
    redirect(loginPath(path));
  }

  if (!hasRole(session, minimumRole)) {
    redirect(session.isAuthenticated ? "/dashboard" : loginPath(path));
  }

  return authSessionApi(session);
}

/** Session for the public auth pages (login, signup, setup). */
export async function currentPageSession() {
  await connection();
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;
  return getSessionFromToken(token);
}

export function safeNextPath(value: string | string[] | undefined) {
  const next = Array.isArray(value) ? value[0] : value;
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}
