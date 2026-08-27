import { NextRequest } from "next/server";
import { apiErrorJson, okJson } from "@/lib/services/apiResponses";
import {
  requireQueryParam,
  validateOptionalLimit,
  validateOptionalTimeframe,
  validateSymbol,
  validateSymbolAccess,
  validateWidgetId
} from "@/lib/services/apiValidation";
import { listWidgetHistory } from "@/lib/services/widgetResultService";
import { getSessionFromRequest } from "@/lib/auth/access";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const session = getSessionFromRequest(request);
    const symbol = validateSymbol(requireQueryParam(params, "symbol"));
    validateSymbolAccess(symbol, session);
    const widgetId = validateWidgetId(requireQueryParam(params, "widgetId"));
    const timeframe = validateOptionalTimeframe(params.get("timeframe"));
    const limit = validateOptionalLimit(params.get("limit"));
    const results = listWidgetHistory({ symbol, widgetId, timeframe, limit });

    return okJson({
      symbol,
      widgetId,
      timeframe: timeframe ?? null,
      limit,
      results,
      count: results.length,
      message: results.length > 0 ? null : "No widget history found for the requested filters"
    });
  } catch (error) {
    return apiErrorJson(error, "Unable to load widget history");
  }
}
