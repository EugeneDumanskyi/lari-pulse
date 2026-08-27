import { NextRequest } from "next/server";
import { authSessionApi, getSessionFromRequest } from "@/lib/auth/access";
import { apiErrorJson, okJson } from "@/lib/services/apiResponses";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    return okJson(authSessionApi(getSessionFromRequest(request)));
  } catch (error) {
    return apiErrorJson(error, "Unable to load session");
  }
}
