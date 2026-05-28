import type Database from "better-sqlite3";
import { getDatabase } from "@/lib/db/client";
import { initializeDatabase } from "@/lib/db/initialize";
import {
  getLatestWidgetResults,
  getWidgetHistory
} from "@/lib/db/repositories/widgetResultsRepository";
import type { WidgetResultRow } from "@/lib/db/types";
import type { WidgetResultApi } from "@/lib/api/types";
import type { SourceRef, WidgetResult } from "@/lib/widgets/types";
import { sortByWidgetPriority } from "@/lib/widgets/catalog";
import { liquidationsWidget } from "@/lib/widgets/liquidity";
import { buildLiquidityWidgetContext } from "./liquidityWidgetContextService";

function parseDetails(value: string, rowId: number) {
  const parsed = JSON.parse(value) as unknown;

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Widget result ${rowId} has invalid details_json`);
  }

  return parsed as Record<string, unknown>;
}

function parseSources(value: string, rowId: number) {
  const parsed = JSON.parse(value) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error(`Widget result ${rowId} has invalid sources_json`);
  }

  return parsed as SourceRef[];
}

export function mapWidgetResultRow(row: WidgetResultRow): WidgetResultApi {
  return {
    id: row.id,
    widgetId: row.widgetId,
    symbol: row.symbol,
    timeframe: row.timeframe,
    score: row.score,
    direction: row.direction,
    confidence: row.confidence,
    severity: row.severity,
    summary: row.summary,
    details: parseDetails(row.detailsJson, row.id),
    sources: parseSources(row.sourcesJson, row.id),
    updatedAt: row.createdAt
  };
}

function mapWidgetResult(result: WidgetResult, id: number): WidgetResultApi {
  return {
    id,
    widgetId: result.widgetId,
    symbol: result.symbol ?? null,
    timeframe: result.timeframe ?? null,
    score: result.score,
    direction: result.direction,
    confidence: result.confidence,
    severity: result.severity,
    summary: result.summary,
    details: result.details,
    sources: result.sources,
    updatedAt: result.updatedAt
  };
}

export function listLatestWidgetResults(
  filters: { symbol: string; timeframe?: string },
  db?: Database.Database
) {
  const database = db ?? getDatabase();

  if (!db) {
    initializeDatabase();
  }

  return sortByWidgetPriority(getLatestWidgetResults(database, filters).map(mapWidgetResultRow));
}

export async function listLatestWidgetResultsWithDerivedLiquidity(
  filters: { symbol: string; timeframe?: string },
  db?: Database.Database
) {
  const database = db ?? getDatabase();

  if (!db) {
    initializeDatabase();
  }

  const results = listLatestWidgetResults(filters, database);

  if (!filters.timeframe) {
    return results;
  }

  const derivedLiquidations = await liquidationsWidget.run({
    symbol: filters.symbol,
    timeframe: filters.timeframe,
    marketContext: {
      liquidity: buildLiquidityWidgetContext(database, {
        symbol: filters.symbol,
        timeframes: [filters.timeframe],
        now: new Date()
      })
    },
    now: new Date()
  });

  return sortByWidgetPriority([
    ...results.filter((result) => result.widgetId !== liquidationsWidget.id),
    mapWidgetResult(derivedLiquidations, 0)
  ]);
}

export function listWidgetHistory(
  filters: { symbol: string; widgetId: string; timeframe?: string; limit?: number },
  db?: Database.Database
) {
  const database = db ?? getDatabase();

  if (!db) {
    initializeDatabase();
  }

  return getWidgetHistory(database, filters).map(mapWidgetResultRow);
}
