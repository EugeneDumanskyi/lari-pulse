import type Database from "better-sqlite3";
import type { NewWidgetResult, WidgetResultRow } from "../types";

interface WidgetResultDbRow {
  id: number;
  widget_id: string;
  symbol: string | null;
  timeframe: string | null;
  score: number;
  direction: string;
  confidence: number;
  severity: "low" | "medium" | "high";
  summary: string;
  details_json: string;
  sources_json: string;
  created_at: string;
}

function mapWidgetResult(row: WidgetResultDbRow): WidgetResultRow {
  return {
    id: row.id,
    widgetId: row.widget_id,
    symbol: row.symbol,
    timeframe: row.timeframe,
    score: row.score,
    direction: row.direction,
    confidence: row.confidence,
    severity: row.severity,
    summary: row.summary,
    detailsJson: row.details_json,
    sourcesJson: row.sources_json,
    createdAt: row.created_at
  };
}

export function insertWidgetResult(db: Database.Database, result: NewWidgetResult) {
  const info = db
    .prepare(
      `
      INSERT INTO widget_results (
        widget_id,
        symbol,
        timeframe,
        score,
        direction,
        confidence,
        severity,
        summary,
        details_json,
        sources_json,
        created_at
      )
      VALUES (
        @widgetId,
        @symbol,
        @timeframe,
        @score,
        @direction,
        @confidence,
        @severity,
        @summary,
        @detailsJson,
        @sourcesJson,
        COALESCE(@createdAt, datetime('now'))
      )
    `
    )
    .run({
      ...result,
      symbol: result.symbol ?? null,
      timeframe: result.timeframe ?? null,
      createdAt: result.createdAt ?? null
    });

  return Number(info.lastInsertRowid);
}

export function getLatestWidgetResults(
  db: Database.Database,
  filters: { symbol?: string; timeframe?: string } = {}
): WidgetResultRow[] {
  const conditions = ["wr.id IN (SELECT MAX(id) FROM widget_results GROUP BY widget_id, symbol, timeframe)"];
  const params: Record<string, string> = {};

  if (filters.symbol) {
    conditions.push("wr.symbol = @symbol");
    params.symbol = filters.symbol;
  }

  if (filters.timeframe) {
    conditions.push("wr.timeframe = @timeframe");
    params.timeframe = filters.timeframe;
  }

  const rows = db
    .prepare(
      `
      SELECT wr.*
      FROM widget_results wr
      WHERE ${conditions.join(" AND ")}
      ORDER BY wr.created_at DESC
    `
    )
    .all(params) as WidgetResultDbRow[];

  return rows.map(mapWidgetResult);
}

export function getWidgetHistory(
  db: Database.Database,
  filters: { symbol: string; widgetId: string; timeframe?: string; limit?: number }
): WidgetResultRow[] {
  const conditions = ["widget_id = @widgetId", "symbol = @symbol"];
  const params: Record<string, string | number> = {
    symbol: filters.symbol,
    widgetId: filters.widgetId,
    limit: filters.limit ?? 100
  };

  if (filters.timeframe) {
    conditions.push("timeframe = @timeframe");
    params.timeframe = filters.timeframe;
  }

  const rows = db
    .prepare(
      `
      SELECT *
      FROM widget_results
      WHERE ${conditions.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT @limit
    `
    )
    .all(params) as WidgetResultDbRow[];

  return rows.map(mapWidgetResult);
}
