import { NextRequest } from "next/server";
import { apiErrorJson, okJson } from "@/lib/services/apiResponses";
import { validateOptionalTimeframe } from "@/lib/services/apiValidation";
import { getCrossMarketWidgets } from "@/lib/services/crossMarketWidgetService";
import { getSessionFromRequest, requireRole } from "@/lib/auth/access";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const session = requireRole(getSessionFromRequest(request), "viewer");
    const timeframe = validateOptionalTimeframe(params.get("timeframe")) ?? "1d";
    const data = await getCrossMarketWidgets({
      timeframe,
      visibleWidgetIds: session.visibleWidgetIds
    });

    return okJson(data);
  } catch (error) {
    return apiErrorJson(error, "Unable to load cross-market widgets");
  }
}
