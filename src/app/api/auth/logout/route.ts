import { NextRequest } from "next/server";
import {
  authSessionApi,
  AUTH_COOKIE_NAME,
  clearSessionCookie,
  clearSessionForToken,
  getSessionFromToken
} from "@/lib/auth/access";
import { okJson } from "@/lib/services/apiResponses";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  clearSessionForToken(request.cookies.get(AUTH_COOKIE_NAME)?.value);

  const response = okJson(authSessionApi(getSessionFromToken(undefined)));
  clearSessionCookie(response);

  return response;
}
