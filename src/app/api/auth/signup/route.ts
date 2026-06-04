import { NextRequest } from "next/server";
import {
  authSessionApi,
  createAuthenticatedSession,
  getSessionFromToken,
  registerAccount,
  setSessionCookie
} from "@/lib/auth/access";
import { apiErrorJson, okJson } from "@/lib/services/apiResponses";
import { getEffectiveVisibleWidgetIds } from "@/lib/services/widgetSettingsService";

export const runtime = "nodejs";

interface SignupBody {
  email?: unknown;
  password?: unknown;
}

function clientIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip");
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as SignupBody;
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const user = registerAccount({ email, password });
    const created = createAuthenticatedSession({
      userId: user.id,
      userAgent: request.headers.get("user-agent"),
      ipAddress: clientIp(request)
    });
    const session = getSessionFromToken(created.token);
    const visibleWidgetIds = getEffectiveVisibleWidgetIds(session);
    const response = okJson(authSessionApi({ ...session, visibleWidgetIds }), { status: 201 });

    setSessionCookie(response, created.token, created.expiresAt);

    return response;
  } catch (error) {
    return apiErrorJson(error, "Unable to create account");
  }
}
