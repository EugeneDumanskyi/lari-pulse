import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/access";
import { okJson, apiErrorJson } from "@/lib/services/apiResponses";
import { ApiInputError, validateOptionalLimit } from "@/lib/services/apiValidation";
import { getOpportunityRadar } from "@/lib/services/opportunityRadarService";
import { appConfig } from "@/lib/config/appConfig";
import { collectionTimeframes } from "@/lib/config/timeframes";

export const runtime = "nodejs";

function parseCsvParam(value: string | null) {
  if (!value) {
    return undefined;
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseSymbols(value: string | null) {
  const symbols = parseCsvParam(value);

  if (!symbols) {
    return undefined;
  }

  const configured = new Set(appConfig.symbols.filter((symbol) => symbol.isActive).map((symbol) => symbol.symbol));

  for (const symbol of symbols) {
    if (!configured.has(symbol.toUpperCase())) {
      throw new ApiInputError(`Unsupported symbol: ${symbol}`);
    }
  }

  return symbols;
}

function parseTimeframes(value: string | null) {
  const timeframes = parseCsvParam(value);

  if (!timeframes) {
    return undefined;
  }

  const allowed = new Set(collectionTimeframes);

  for (const timeframe of timeframes) {
    if (!allowed.has(timeframe as typeof collectionTimeframes[number])) {
      throw new ApiInputError(`Unsupported radar timeframe: ${timeframe}`);
    }
  }

  return timeframes;
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const session = getSessionFromRequest(request);
    const data = await getOpportunityRadar({
      session,
      symbols: parseSymbols(params.get("symbols")),
      timeframes: parseTimeframes(params.get("timeframes")),
      limit: validateOptionalLimit(params.get("limit"), 20, 50)
    });

    return okJson(data);
  } catch (error) {
    return apiErrorJson(error, "Unable to build opportunity radar");
  }
}
