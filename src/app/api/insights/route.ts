import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/access";
import { apiErrorJson, okJson } from "@/lib/services/apiResponses";
import { validateOptionalRange } from "@/lib/services/apiValidation";
import { getInsights } from "@/lib/services/insights/insights.service";
import type { InsightRange } from "@/lib/services/insights/insights.types";
import {
  defaultSituationSymbol,
  defaultSituationTimeframe
} from "@/lib/services/situationOverview/situationOverview.service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    // `validateOptionalRange` already restricts to the four values, so this is
    // a narrowing rather than a widening of what it allows.
    const range = validateOptionalRange(params.get("range")) as InsightRange | undefined;

    const data = getInsights({
      session: getSessionFromRequest(request),
      symbol: params.get("symbol") ?? defaultSituationSymbol(),
      timeframe: params.get("timeframe") ?? defaultSituationTimeframe(),
      range
    });

    return okJson(data);
  } catch (error) {
    return apiErrorJson(error, "Unable to read insights");
  }
}
