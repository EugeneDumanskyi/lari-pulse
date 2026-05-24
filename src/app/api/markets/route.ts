import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/access";
import { apiErrorJson, okJson } from "@/lib/services/apiResponses";
import { getMarkets } from "@/lib/services/marketCatalogService";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    return okJson(getMarkets(getSessionFromRequest(request)));
  } catch (error) {
    return apiErrorJson(error, "Unable to load markets");
  }
}
