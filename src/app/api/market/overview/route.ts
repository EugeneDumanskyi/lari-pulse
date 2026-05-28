import { NextRequest } from "next/server";
import { apiErrorJson, okJson } from "@/lib/services/apiResponses";
import {
  requireQueryParam,
  validateOptionalLimit,
  validateOptionalRange,
  validateOptionalTimeframe,
  validateSymbol,
  validateSymbolAccess
} from "@/lib/services/apiValidation";
import { getDashboardMarketOverview } from "@/lib/services/marketDataService";
import { getSessionFromRequest } from "@/lib/auth/access";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const session = getSessionFromRequest(request);
    const symbol = validateSymbol(requireQueryParam(params, "symbol"));
    validateSymbolAccess(symbol, session);
    const timeframe = validateOptionalTimeframe(params.get("timeframe")) ?? "1h";
    const interval = validateOptionalTimeframe(params.get("interval")) ?? timeframe;
    const range = validateOptionalRange(params.get("range"));
    const limit = validateOptionalLimit(params.get("limit"), 120, 300);

    return okJson(await getDashboardMarketOverview({ symbol, timeframe, interval, range, limit }));
  } catch (error) {
    return apiErrorJson(error, "Unable to load market overview");
  }
}
