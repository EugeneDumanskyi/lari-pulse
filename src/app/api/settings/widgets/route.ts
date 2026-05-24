import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/access";
import { apiErrorJson, okJson } from "@/lib/services/apiResponses";
import {
  getWidgetSettingsState,
  updateWidgetSettings
} from "@/lib/services/widgetSettingsService";
import { ApiInputError } from "@/lib/services/apiValidation";

export const runtime = "nodejs";

interface WidgetSettingsBody {
  enabledWidgetIds?: unknown;
}

function parseEnabledWidgetIds(body: WidgetSettingsBody) {
  if (!Array.isArray(body.enabledWidgetIds)) {
    throw new ApiInputError("enabledWidgetIds must be an array of widget ids", 400);
  }

  const invalid = body.enabledWidgetIds.find((widgetId) => typeof widgetId !== "string");

  if (invalid !== undefined) {
    throw new ApiInputError("enabledWidgetIds must contain only strings", 400);
  }

  return [...new Set(body.enabledWidgetIds)] as string[];
}

export async function GET(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);

    return okJson(getWidgetSettingsState(session));
  } catch (error) {
    return apiErrorJson(error, "Unable to load widget settings");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    const body = (await request.json().catch(() => ({}))) as WidgetSettingsBody;

    return okJson(updateWidgetSettings({ enabledWidgetIds: parseEnabledWidgetIds(body) }, session));
  } catch (error) {
    return apiErrorJson(error, "Unable to update widget settings");
  }
}
