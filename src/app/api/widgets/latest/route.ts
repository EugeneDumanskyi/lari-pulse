import { NextRequest } from "next/server";
import { apiErrorJson, okJson } from "@/lib/services/apiResponses";
import {
  requireQueryParam,
  validateOptionalTimeframe,
  validateSymbol
} from "@/lib/services/apiValidation";
import { listLatestWidgetResults } from "@/lib/services/widgetResultService";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const symbol = validateSymbol(requireQueryParam(params, "symbol"));
    const timeframe = validateOptionalTimeframe(params.get("timeframe"));
    const results = listLatestWidgetResults({ symbol, timeframe });

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
