import { NextRequest } from "next/server";
import { apiErrorJson, okJson } from "@/lib/services/apiResponses";
import { validateOptionalTimeframe } from "@/lib/services/apiValidation";
import { getCrossMarketWidgets } from "@/lib/services/crossMarketWidgetService";
import { getSessionFromRequest } from "@/lib/auth/access";
import { getEffectiveVisibleWidgetIds } from "@/lib/services/widgetSettingsService";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const session = getSessionFromRequest(request);
    const timeframe = validateOptionalTimeframe(params.get("timeframe")) ?? "1d";

    if (!session.isAdmin) {
      return okJson({
        timeframe,
        results: [],
        assetStatuses: [],
        correlations: [],
        warnings: ["Cross-market intelligence is locked for the current access level."],
        updatedAt: new Date().toISOString()
      });
    }

    const data = await getCrossMarketWidgets({
      timeframe,
      visibleWidgetIds: getEffectiveVisibleWidgetIds(session)
    });

    return okJson(data);
  } catch (error) {
    return apiErrorJson(error, "Unable to load cross-market widgets");
  }
}
