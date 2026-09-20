import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/access";
import { apiErrorJson, okJson } from "@/lib/services/apiResponses";
import {
  ApiInputError,
  validateCollectionTimeframe,
  validateJsonQueryParam,
  validateOptionalLimit,
  validateSymbol,
  validateSymbolAccess
} from "@/lib/services/apiValidation";
import { parseScanFilter, runScan } from "@/lib/services/scanService";
import type { AuthSession } from "@/lib/auth/access";

export const runtime = "nodejs";

const maxFilterLength = 2000;

function parseCsvParam(value: string | null) {
  if (!value) {
    return undefined;
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseSymbols(value: string | null, session: AuthSession) {
  const symbols = parseCsvParam(value);

  if (!symbols) {
    return undefined;
  }

  // `validateSymbol` rejects an inactive or unknown symbol; `validateSymbolAccess`
  // rejects one this session may not read. Neither alone covers both.
  return symbols.map((symbol) => validateSymbolAccess(validateSymbol(symbol), session));
}

function parseTimeframes(value: string | null) {
  const timeframes = parseCsvParam(value);

  if (!timeframes) {
    return undefined;
  }

  return timeframes.map((timeframe) => validateCollectionTimeframe(timeframe));
}

/**
 * `match` may arrive inside the encoded filter or as its own parameter. When
 * both are present and disagree the request is rejected rather than one
 * silently winning.
 */
function reconcileMatch(filterValue: unknown, matchParam: string | null) {
  if (!matchParam) {
    return filterValue;
  }

  if (matchParam !== "all" && matchParam !== "any") {
    throw new ApiInputError(`Unsupported match: ${matchParam}`);
  }

  if (typeof filterValue !== "object" || filterValue === null || Array.isArray(filterValue)) {
    return filterValue;
  }

  const filterObject = filterValue as Record<string, unknown>;

  if (filterObject.match !== undefined && filterObject.match !== matchParam) {
    throw new ApiInputError("match was given twice with conflicting values");
  }

  return { ...filterObject, match: matchParam };
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const session = getSessionFromRequest(request);
    const filterValue = validateJsonQueryParam(params.get("filter"), "filter", maxFilterLength);
    const filter = parseScanFilter(reconcileMatch(filterValue, params.get("match")));

    const data = await runScan({
      session,
      filter,
      symbols: parseSymbols(params.get("symbols"), session),
      timeframes: parseTimeframes(params.get("timeframes")),
      limit: validateOptionalLimit(params.get("limit"), 50, 200)
    });

    return okJson(data);
  } catch (error) {
    return apiErrorJson(error, "Unable to run the scan");
  }
}
