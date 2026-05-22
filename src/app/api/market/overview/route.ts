import { NextRequest } from "next/server";
import { apiErrorJson, okJson } from "@/lib/services/apiResponses";
import {
  requireQueryParam,
  validateOptionalLimit,
  validateOptionalTimeframe,
  validateSymbol
} from "@/lib/services/apiValidation";
import { getMarketOverview } from "@/lib/services/marketDataService";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const symbol = validateSymbol(requireQueryParam(params, "symbol"));
    const timeframe = validateOptionalTimeframe(params.get("timeframe")) ?? "1h";
    const limit = validateOptionalLimit(params.get("limit"), 120, 300);

    return okJson(getMarketOverview({ symbol, timeframe, limit }));
  } catch (error) {
    return apiErrorJson(error, "Unable to load market overview");
  }
}
