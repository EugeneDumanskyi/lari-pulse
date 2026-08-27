import { NextRequest } from "next/server";
import { apiErrorJson, okJson } from "@/lib/services/apiResponses";
import { listSymbols } from "@/lib/services/symbolService";
import { authSessionApi, getSessionFromRequest, requireRole } from "@/lib/auth/access";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const session = requireRole(getSessionFromRequest(request), "viewer");
    const symbols = listSymbols();

    return okJson({
      symbols,
      count: symbols.length,
      session: authSessionApi(session)
    });
  } catch (error) {
    return apiErrorJson(error, "Unable to load symbols");
  }
}
