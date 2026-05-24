import { NextRequest } from "next/server";
import { apiErrorJson, okJson } from "@/lib/services/apiResponses";
import { listSymbols } from "@/lib/services/symbolService";
import { authSessionApi, getSessionFromRequest } from "@/lib/auth/access";
import { getEffectiveVisibleWidgetIds } from "@/lib/services/widgetSettingsService";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    const visibleWidgetIds = getEffectiveVisibleWidgetIds(session);
    const symbols = listSymbols(undefined, session);

    return okJson({
      symbols,
      count: symbols.length,
      session: authSessionApi({ ...session, visibleWidgetIds })
    });
  } catch (error) {
    return apiErrorJson(error, "Unable to load symbols");
  }
}
