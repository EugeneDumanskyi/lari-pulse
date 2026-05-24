import { NextRequest } from "next/server";
import { okJson } from "@/lib/services/apiResponses";
import { authSessionApi, getSessionFromRequest } from "@/lib/auth/access";
import { getEffectiveVisibleWidgetIds } from "@/lib/services/widgetSettingsService";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  const visibleWidgetIds = getEffectiveVisibleWidgetIds(session);

  return okJson(authSessionApi({ ...session, visibleWidgetIds }));
}
