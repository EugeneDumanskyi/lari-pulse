import { NextRequest, NextResponse } from "next/server";
import { authSessionApi, AUTH_COOKIE_NAME, clearSessionCookie, clearSessionForToken, getSessionFromToken } from "@/lib/auth/access";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  clearSessionForToken(request.cookies.get(AUTH_COOKIE_NAME)?.value);

  const response = NextResponse.json({
    status: "ok",
    data: authSessionApi(getSessionFromToken(undefined))
  });

  clearSessionCookie(response);

  return response;
}
