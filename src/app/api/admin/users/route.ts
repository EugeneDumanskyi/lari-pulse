import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/access";
import { listUsersForAdmin } from "@/lib/services/accountService";
import { apiErrorJson, okJson } from "@/lib/services/apiResponses";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    return okJson(listUsersForAdmin(getSessionFromRequest(request)));
  } catch (error) {
    return apiErrorJson(error, "Unable to load users");
  }
}
