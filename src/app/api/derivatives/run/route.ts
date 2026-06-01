import { NextRequest, NextResponse } from "next/server";
import { canAccessSymbol, getSessionFromRequest } from "@/lib/auth/access";
import { runBinanceDerivativesCollection } from "@/lib/services/derivativesCollectionService";

export const runtime = "nodejs";

interface DerivativesRunRequestBody {
  symbols?: unknown;
  periods?: unknown;
  historyLimit?: unknown;
}

function asOptionalStringArray(value: unknown, field: string) {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${field} must be an array of strings`);
  }

  return value;
}

function asOptionalLimit(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number") {
    throw new Error("historyLimit must be a number");
  }

  return value;
}

async function readOptionalJson(request: NextRequest): Promise<DerivativesRunRequestBody> {
  const contentType = request.headers.get("content-type");

  if (!contentType?.includes("application/json")) {
    return {};
  }

  return (await request.json()) as DerivativesRunRequestBody;
}

export async function POST(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    const body = await readOptionalJson(request);
    const symbols = asOptionalStringArray(body.symbols, "symbols");

    if (symbols?.some((symbol) => !canAccessSymbol(session, symbol.toUpperCase()))) {
      return NextResponse.json(
        {
          status: "error",
          message: "One or more symbols are locked for the current access level"
        },
        { status: 403 }
      );
    }

    const result = await runBinanceDerivativesCollection({
      symbols,
      periods: asOptionalStringArray(body.periods, "periods"),
      historyLimit: asOptionalLimit(body.historyLimit)
    });

    return NextResponse.json(result, {
      status: result.status === "error" ? 502 : 200
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Derivatives collection request failed"
      },
      { status: 400 }
    );
  }
}
