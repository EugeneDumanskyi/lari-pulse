import type Database from "better-sqlite3";
import type { NewSituationOverview, SituationOverviewRecord } from "../types";

interface SituationOverviewDbRow {
  id: number;
  symbol: string;
  timeframe: string;
  generated_at: string;
  title: string;
  summary: string;
  bias: string;
  risk_level: string;
  confidence: string;
  score: number;
  risk_score: number;
  main_drivers_json: string;
  conflicting_signals_json: string;
  watch_conditions_json: string;
  data_warnings_json: string;
  changes_json: string;
  source_widgets_json: string;
  meta_json: string;
  created_at: string;
}

function mapSituationOverview(row: SituationOverviewDbRow): SituationOverviewRecord {
  return {
    id: row.id,
    symbol: row.symbol,
    timeframe: row.timeframe,
    generatedAt: row.generated_at,
    title: row.title,
    summary: row.summary,
    bias: row.bias,
    riskLevel: row.risk_level,
    confidence: row.confidence,
    score: row.score,
    riskScore: row.risk_score,
    mainDriversJson: row.main_drivers_json,
    conflictingSignalsJson: row.conflicting_signals_json,
    watchConditionsJson: row.watch_conditions_json,
    dataWarningsJson: row.data_warnings_json,
    changesJson: row.changes_json,
    sourceWidgetsJson: row.source_widgets_json,
    metaJson: row.meta_json,
    createdAt: row.created_at
  };
}

export function insertSituationOverview(db: Database.Database, overview: NewSituationOverview) {
  const info = db
    .prepare(
      `
      INSERT INTO situation_overviews (
        symbol,
        timeframe,
        generated_at,
        title,
        summary,
        bias,
        risk_level,
        confidence,
        score,
        risk_score,
        main_drivers_json,
        conflicting_signals_json,
        watch_conditions_json,
        data_warnings_json,
        changes_json,
        source_widgets_json,
        meta_json
      )
      VALUES (
        @symbol,
        @timeframe,
        @generatedAt,
        @title,
        @summary,
        @bias,
        @riskLevel,
        @confidence,
        @score,
        @riskScore,
        @mainDriversJson,
        @conflictingSignalsJson,
        @watchConditionsJson,
        @dataWarningsJson,
        @changesJson,
        @sourceWidgetsJson,
        @metaJson
      )
    `
    )
    .run(overview);

  return Number(info.lastInsertRowid);
}

export function getLatestSituationOverview(
  db: Database.Database,
  filters: { symbol: string; timeframe: string }
) {
  const row = db
    .prepare(
      `
      SELECT *
      FROM situation_overviews
      WHERE symbol = @symbol
        AND timeframe = @timeframe
      ORDER BY generated_at DESC, id DESC
      LIMIT 1
    `
    )
    .get(filters) as SituationOverviewDbRow | undefined;

  return row ? mapSituationOverview(row) : null;
}

export function listSituationOverviewHistory(
  db: Database.Database,
  filters: { symbol: string; timeframe: string; limit?: number }
) {
  const rows = db
    .prepare(
      `
      SELECT *
      FROM situation_overviews
      WHERE symbol = @symbol
        AND timeframe = @timeframe
      ORDER BY generated_at DESC, id DESC
      LIMIT @limit
    `
    )
    .all({
      ...filters,
      limit: filters.limit ?? 50
    }) as SituationOverviewDbRow[];

  return rows.map(mapSituationOverview);
}
