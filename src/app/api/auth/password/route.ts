import { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, getSessionFromRequest } from "@/lib/auth/access";
import { changeOwnPassword } from "@/lib/services/accountService";
import { apiErrorJson, okJson } from "@/lib/services/apiResponses";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    const body = (await request.json().catch(() => ({}))) as { currentPassword?: unknown; newPassword?: unknown };

    changeOwnPassword(session, {
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
      currentToken: request.cookies.get(AUTH_COOKIE_NAME)?.value
    });

    return okJson({ changed: true });
  } catch (error) {
    return apiErrorJson(error, "Unable to change password");
  }
}
