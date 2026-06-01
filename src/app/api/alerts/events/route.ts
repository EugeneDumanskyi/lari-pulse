import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/access";
import { okJson, apiErrorJson } from "@/lib/services/apiResponses";
import { listEventsForSession } from "@/lib/services/alertService";
import { validateOptionalLimit } from "@/lib/services/apiValidation";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    const params = request.nextUrl.searchParams;
    const includeAcknowledged = params.get("includeAcknowledged") === "true";
    const limit = validateOptionalLimit(params.get("limit"), 100, 250);

    return okJson(listEventsForSession({
      session,
      includeAcknowledged,
      limit
    }));
  } catch (error) {
    return apiErrorJson(error, "Unable to load alert events");
  }
}
