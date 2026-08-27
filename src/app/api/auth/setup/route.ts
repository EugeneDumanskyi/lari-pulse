import { NextRequest } from "next/server";
import { completeFirstRunSetup } from "@/lib/services/accountService";
import { apiErrorJson } from "@/lib/services/apiResponses";
import { signedInResponse } from "@/lib/services/authResponses";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { email?: unknown; password?: unknown };
    const admin = completeFirstRunSetup(body);

    return signedInResponse(request, admin.id, { status: 201 });
  } catch (error) {
    return apiErrorJson(error, "Unable to complete setup");
  }
}
