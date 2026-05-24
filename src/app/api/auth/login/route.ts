import { NextRequest, NextResponse } from "next/server";
import {
  authenticateAdmin,
  authSessionApi,
  createAdminSession,
  setAdminCookie
} from "@/lib/auth/access";
import { getEffectiveVisibleWidgetIds } from "@/lib/services/widgetSettingsService";

export const runtime = "nodejs";

interface LoginBody {
  username?: unknown;
  password?: unknown;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as LoginBody;
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!authenticateAdmin({ username, password })) {
    return NextResponse.json(
      {
        status: "error",
        message: "Invalid username or password"
      },
      { status: 401 }
    );
  }

  const session = createAdminSession(username);
  const visibleWidgetIds = getEffectiveVisibleWidgetIds(session);
  const response = NextResponse.json({
    status: "ok",
    data: authSessionApi({ ...session, visibleWidgetIds })
  });

  setAdminCookie(response, username);

  return response;
}
