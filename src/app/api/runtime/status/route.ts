import { apiErrorJson, okJson } from "@/lib/services/apiResponses";
import { getRuntimeStatus } from "@/lib/services/runtimeStatusService";

export const runtime = "nodejs";

export function GET() {
  try {
    return okJson(getRuntimeStatus());
  } catch (error) {
    return apiErrorJson(error, "Unable to load runtime status");
  }
}
