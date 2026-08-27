import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/access";
import { deleteUserForAdmin, listUsersForAdmin, updateUserForAdmin } from "@/lib/services/accountService";
import { apiErrorJson, okJson } from "@/lib/services/apiResponses";
import { parseRouteId } from "@/lib/services/apiValidation";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getSessionFromRequest(request);
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { role?: unknown; status?: unknown };
    updateUserForAdmin(session, parseRouteId(id, "user id"), body);

    return okJson(listUsersForAdmin(session));
  } catch (error) {
    return apiErrorJson(error, "Unable to update user");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getSessionFromRequest(request);
    const { id } = await params;
    deleteUserForAdmin(session, parseRouteId(id, "user id"));

    return okJson(listUsersForAdmin(session));
  } catch (error) {
    return apiErrorJson(error, "Unable to delete user");
  }
}
