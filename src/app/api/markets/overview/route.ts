import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/access";
import { apiErrorJson, okJson } from "@/lib/services/apiResponses";
import { ApiInputError, requireQueryParam, validateOptionalLimit, validateOptionalTimeframe, validateSymbolAccess } from "@/lib/services/apiValidation";
import { getConfiguredMarket, getDefaultMarketTimeframe } from "@/lib/services/marketCatalogService";
import { getMarketOverview } from "@/lib/services/marketDataService";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const session = getSessionFromRequest(request);
    const symbol = requireQueryParam(params, "symbol").trim().toUpperCase();
    const market = getConfiguredMarket(symbol);

    if (!market) {
      throw new ApiInputError(`Unsupported market: ${symbol}`);
    }

    validateSymbolAccess(symbol, session);

    const requestedTimeframe = validateOptionalTimeframe(params.get("timeframe"));
    const timeframe = requestedTimeframe ?? getDefaultMarketTimeframe(symbol) ?? "1d";
    const limit = validateOptionalLimit(params.get("limit"), 160, 300);

    return okJson(getMarketOverview({ symbol, timeframe, limit }));
  } catch (error) {
    return apiErrorJson(error, "Unable to load market overview");
  }
}
