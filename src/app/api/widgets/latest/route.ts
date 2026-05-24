import { NextRequest } from "next/server";
import { apiErrorJson, okJson } from "@/lib/services/apiResponses";
import {
  requireQueryParam,
  validateOptionalTimeframe,
  validateSymbol,
  validateSymbolAccess
} from "@/lib/services/apiValidation";
import { listLatestWidgetResults } from "@/lib/services/widgetResultService";
import { filterVisibleWidgetResults, getSessionFromRequest } from "@/lib/auth/access";
import { getEffectiveVisibleWidgetIds } from "@/lib/services/widgetSettingsService";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const session = getSessionFromRequest(request);
    const symbol = validateSymbol(requireQueryParam(params, "symbol"));
    validateSymbolAccess(symbol, session);
    const timeframe = validateOptionalTimeframe(params.get("timeframe"));
    const visibleWidgetIds = getEffectiveVisibleWidgetIds(session);
    const results = filterVisibleWidgetResults(listLatestWidgetResults({ symbol, timeframe }), {
      ...session,
      visibleWidgetIds
    });

    return okJson({
      symbol,
      timeframe: timeframe ?? null,
      results,
      count: results.length,
      message: results.length > 0 ? null : "No widget results found for the requested filters"
    });
  } catch (error) {
    return apiErrorJson(error, "Unable to load latest widget results");
  }
}
