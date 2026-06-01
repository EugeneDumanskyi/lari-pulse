import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/access";
import { apiErrorJson, okJson } from "@/lib/services/apiResponses";
import {
  requireQueryParam,
  validateOptionalTimeframe,
  validateSymbol,
  validateSymbolAccess
} from "@/lib/services/apiValidation";
import { getChartOverlays } from "@/lib/services/chartOverlayService";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const session = getSessionFromRequest(request);
    const symbol = validateSymbol(requireQueryParam(params, "symbol"));
    validateSymbolAccess(symbol, session);
    const timeframe = validateOptionalTimeframe(params.get("timeframe")) ?? "1h";

    return okJson(await getChartOverlays({ symbol, timeframe, session }));
  } catch (error) {
    return apiErrorJson(error, "Unable to load chart overlays");
  }
}
