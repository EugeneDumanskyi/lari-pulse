import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/access";
import { createInviteForAdmin, listInvitesForAdmin } from "@/lib/services/accountService";
import { apiErrorJson, okJson } from "@/lib/services/apiResponses";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    return okJson(listInvitesForAdmin(getSessionFromRequest(request)));
  } catch (error) {
    return apiErrorJson(error, "Unable to load invites");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { role?: unknown; email?: unknown };
    return okJson(createInviteForAdmin(getSessionFromRequest(request), body), { status: 201 });
  } catch (error) {
    return apiErrorJson(error, "Unable to create invite");
  }
}
