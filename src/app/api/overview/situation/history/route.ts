import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/access";
import { apiErrorJson, okJson } from "@/lib/services/apiResponses";
import {
  validateOptionalLimit,
  validateOptionalTimeframe,
  validateSymbol,
  validateSymbolAccess
} from "@/lib/services/apiValidation";
import {
  defaultSituationSymbol,
  defaultSituationTimeframe,
  listSituationOverviewTimeline
} from "@/lib/services/situationOverview/situationOverview.service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const session = getSessionFromRequest(request);
    const symbol = validateSymbol(params.get("symbol") ?? defaultSituationSymbol());
    validateSymbolAccess(symbol, session);
    const timeframe = validateOptionalTimeframe(params.get("timeframe")) ?? defaultSituationTimeframe();
    const limit = validateOptionalLimit(params.get("limit"), 50, 200);

    return okJson(
      listSituationOverviewTimeline({
        symbol,
        timeframe,
        session,
        limit
      })
    );
  } catch (error) {
    return apiErrorJson(error, "Unable to load situation overview history");
  }
}
