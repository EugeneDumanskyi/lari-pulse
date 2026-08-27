import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/access";
import { getInstanceSettingsForAdmin, updateInstanceSettingsForAdmin } from "@/lib/services/accountService";
import { apiErrorJson, okJson } from "@/lib/services/apiResponses";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    return okJson(getInstanceSettingsForAdmin(getSessionFromRequest(request)));
  } catch (error) {
    return apiErrorJson(error, "Unable to load instance settings");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { signupMode?: unknown; publicDashboard?: unknown };
    return okJson(updateInstanceSettingsForAdmin(getSessionFromRequest(request), body));
  } catch (error) {
    return apiErrorJson(error, "Unable to update instance settings");
  }
}
