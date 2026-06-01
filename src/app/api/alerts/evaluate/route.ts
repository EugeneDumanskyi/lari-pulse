import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/access";
import { okJson, apiErrorJson } from "@/lib/services/apiResponses";
import {
  defaultSituationSymbol,
  defaultSituationTimeframe,
  getSituationOverview
} from "@/lib/services/situationOverview/situationOverview.service";
import { listEventsForSession } from "@/lib/services/alertService";
import {
  validateOptionalTimeframe,
  validateSymbol,
  validateSymbolAccess
} from "@/lib/services/apiValidation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    const body = await request.json().catch(() => ({})) as { symbol?: string; timeframe?: string };
    const symbol = validateSymbol(body.symbol ?? defaultSituationSymbol());
    validateSymbolAccess(symbol, session);
    const timeframe = validateOptionalTimeframe(body.timeframe ?? null) ?? defaultSituationTimeframe();
    const overview = await getSituationOverview({
      symbol,
      timeframe,
      session
    });
    const events = listEventsForSession({
      session,
      includeAcknowledged: false,
      limit: 50
    }).filter((event) => event.symbol === symbol && event.timeframe === timeframe);

    return okJson({
      overview,
      events,
      evaluatedAt: new Date().toISOString()
    });
  } catch (error) {
    return apiErrorJson(error, "Unable to evaluate alert rules");
  }
}
