import type Database from "better-sqlite3";
import { insertWidgetResult } from "@/lib/db/repositories/widgetResultsRepository";
import type { NewWidgetResult } from "@/lib/db/types";
import type {
  SourceRef,
  WidgetContext,
  WidgetEngine,
  WidgetResult,
  WidgetRunOutcome,
  WidgetSeverity
} from "./types";
import type { WidgetRegistry } from "./registry";

const SEVERITIES: WidgetSeverity[] = ["low", "medium", "high"];

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSourceRef(value: unknown): value is SourceRef {
  if (!isPlainRecord(value)) {
    return false;
  }

  return (
    typeof value.source === "string" &&
    typeof value.type === "string" &&
    (value.symbol === undefined || typeof value.symbol === "string") &&
    (value.timeframe === undefined || typeof value.timeframe === "string") &&
    (value.updatedAt === undefined || typeof value.updatedAt === "string")
  );
}

function isValidIsoDate(value: string) {
  return Number.isFinite(Date.parse(value));
}

export function validateWidgetResult(result: WidgetResult) {
  const errors: string[] = [];

  if (!result.widgetId) {
    errors.push("widgetId is required");
  }

  if (!Number.isFinite(result.score) || result.score < 0 || result.score > 100) {
    errors.push("score must be a number from 0 to 100");
  }

  if (!result.direction) {
    errors.push("direction is required");
  }

  if (!Number.isFinite(result.confidence) || result.confidence < 0 || result.confidence > 1) {
    errors.push("confidence must be a number from 0 to 1");
  }

  if (!SEVERITIES.includes(result.severity)) {
    errors.push("severity must be low, medium, or high");
  }

  if (!result.summary) {
    errors.push("summary is required");
  }

  if (!isPlainRecord(result.details)) {
    errors.push("details must be an object");
  }

  if (!Array.isArray(result.sources) || !result.sources.every(isSourceRef)) {
    errors.push("sources must be an array of source references");
  }

  if (!result.updatedAt || !isValidIsoDate(result.updatedAt)) {
    errors.push("updatedAt must be an ISO-compatible timestamp");
  }

  if (errors.length > 0) {
    throw new Error(`Invalid widget result: ${errors.join("; ")}`);
  }
}

export function toNewWidgetResult(result: WidgetResult): NewWidgetResult {
  validateWidgetResult(result);

  return {
    widgetId: result.widgetId,
    symbol: result.symbol,
    timeframe: result.timeframe,
    score: result.score,
    direction: result.direction,
    confidence: result.confidence,
    severity: result.severity,
    summary: result.summary,
    detailsJson: JSON.stringify(result.details),
    sourcesJson: JSON.stringify(result.sources),
    createdAt: result.updatedAt
  };
}

export async function runWidgetEngine(
  engine: WidgetEngine,
  context: WidgetContext,
  options: { db?: Database.Database; save?: boolean } = {}
): Promise<WidgetRunOutcome> {
  try {
    const result = await engine.run(context);
    validateWidgetResult(result);

    const savedRowId =
      options.save && options.db
        ? insertWidgetResult(options.db, toNewWidgetResult(result))
        : undefined;

    return {
      widgetId: engine.id,
      status: "success",
      result,
      savedRowId
    };
  } catch (error) {
    return {
      widgetId: engine.id,
      status: "failure",
      error: error instanceof Error ? error.message : "Unknown widget runner error"
    };
  }
}

export async function runWidgetRegistry(
  registry: WidgetRegistry,
  context: WidgetContext,
  options: { db?: Database.Database; save?: boolean; widgetIds?: string[] } = {}
) {
  const engines = options.widgetIds
    ? options.widgetIds.map((widgetId) => {
        const engine = registry.get(widgetId);

        if (!engine) {
          throw new Error(`Unknown widget engine: ${widgetId}`);
        }

        return engine;
      })
    : registry.list();

  const outcomes: WidgetRunOutcome[] = [];

  for (const engine of engines) {
    outcomes.push(await runWidgetEngine(engine, context, options));
  }

  return outcomes;
}
