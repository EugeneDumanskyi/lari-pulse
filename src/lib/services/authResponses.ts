import type { NextRequest } from "next/server";
import {
  authSessionApi,
  createAuthenticatedSession,
  getSessionFromToken,
  setSessionCookie
} from "@/lib/auth/access";
import { clientIpFromHeaders } from "@/lib/auth/loginThrottle";
import { okJson } from "./apiResponses";

/** Starts a session for the user and returns it as JSON with the session cookie set. */
export function signedInResponse(request: NextRequest, userId: number, init?: ResponseInit) {
  const created = createAuthenticatedSession({
    userId,
    userAgent: request.headers.get("user-agent"),
    ipAddress: clientIpFromHeaders(request.headers)
  });
  const response = okJson(authSessionApi(getSessionFromToken(created.token)), init);

  setSessionCookie(response, created.token, created.expiresAt);

  return response;
}
