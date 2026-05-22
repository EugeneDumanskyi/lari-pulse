import { NextRequest, NextResponse } from "next/server";
import { runPhase1Refresh } from "@/lib/services/phase1RefreshService";

export const runtime = "nodejs";

interface CollectRunRequestBody {
  symbols?: unknown;
  timeframes?: unknown;
  limit?: unknown;
  calculateWidgets?: unknown;
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
    throw new Error("limit must be a number");
  }

  return value;
}

function asOptionalBoolean(value: unknown, field: string) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new Error(`${field} must be a boolean`);
  }

  return value;
}

async function readOptionalJson(request: NextRequest): Promise<CollectRunRequestBody> {
  const contentType = request.headers.get("content-type");

  if (!contentType?.includes("application/json")) {
    return {};
  }

  return (await request.json()) as CollectRunRequestBody;
}

export async function POST(request: NextRequest) {
  try {
    const body = await readOptionalJson(request);
    const result = await runPhase1Refresh({
      symbols: asOptionalStringArray(body.symbols, "symbols"),
      timeframes: asOptionalStringArray(body.timeframes, "timeframes"),
      limit: asOptionalLimit(body.limit),
      calculateWidgets: asOptionalBoolean(body.calculateWidgets, "calculateWidgets")
    });

    const statusCode = result.status === "error" ? 502 : 200;

    return NextResponse.json(
      {
        ...result.collection,
        status: result.status,
        collection: result.collection,
        widgetCalculation: result.widgetCalculation
      },
      { status: statusCode }
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Collection request failed"
      },
      { status: 400 }
    );
  }
}
