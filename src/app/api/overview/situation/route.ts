import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/access";
import { apiErrorJson, okJson } from "@/lib/services/apiResponses";
import {
  validateOptionalTimeframe,
  validateSymbol,
  validateSymbolAccess
} from "@/lib/services/apiValidation";
import {
  defaultSituationSymbol,
  defaultSituationTimeframe,
  getSituationOverview
} from "@/lib/services/situationOverview/situationOverview.service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const session = getSessionFromRequest(request);
    const symbol = validateSymbol(params.get("symbol") ?? defaultSituationSymbol());
    validateSymbolAccess(symbol, session);
    const timeframe = validateOptionalTimeframe(params.get("timeframe")) ?? defaultSituationTimeframe();
    const overview = await getSituationOverview({
      symbol,
      timeframe,
      session
    });

    return okJson(overview);
  } catch (error) {
    return apiErrorJson(error, "Unable to build situation overview");
  }
}

