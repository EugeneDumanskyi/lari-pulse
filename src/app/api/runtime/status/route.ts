import { NextRequest } from "next/server";
import { getSessionFromRequest, requireRole } from "@/lib/auth/access";
import { apiErrorJson, okJson } from "@/lib/services/apiResponses";
import { getRuntimeStatus } from "@/lib/services/runtimeStatusService";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  try {
    requireRole(getSessionFromRequest(request), "viewer");
    return okJson(getRuntimeStatus());
  } catch (error) {
    return apiErrorJson(error, "Unable to load runtime status");
  }
}
