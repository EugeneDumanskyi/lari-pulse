import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/access";
import { listInvitesForAdmin, revokeInviteForAdmin } from "@/lib/services/accountService";
import { apiErrorJson, okJson } from "@/lib/services/apiResponses";
import { parseRouteId } from "@/lib/services/apiValidation";

export const runtime = "nodejs";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getSessionFromRequest(request);
    const { id } = await params;
    revokeInviteForAdmin(session, parseRouteId(id, "invite id"));

    return okJson(listInvitesForAdmin(session));
  } catch (error) {
    return apiErrorJson(error, "Unable to revoke invite");
  }
}
