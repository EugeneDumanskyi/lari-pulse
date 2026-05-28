import type Database from "better-sqlite3";
import type { NewSourceRun, SourceRunRecord, SourceRunStatus } from "../types";

interface SourceRunDbRow {
  id: number;
  source: string;
  collector_id: string;
  status: SourceRunStatus;
  started_at: string;
  finished_at: string | null;
  error_message: string | null;
  metadata_json: string | null;
}

function mapSourceRun(row: SourceRunDbRow): SourceRunRecord {
  return {
    id: row.id,
    source: row.source,
    collectorId: row.collector_id,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    errorMessage: row.error_message,
    metadataJson: row.metadata_json
  };
}

export function insertSourceRun(db: Database.Database, run: NewSourceRun) {
  const info = db
    .prepare(
      `
      INSERT INTO source_runs (
        source,
        collector_id,
        status,
        started_at,
        finished_at,
        error_message,
        metadata_json
      )
      VALUES (
        @source,
        @collectorId,
        @status,
        COALESCE(@startedAt, datetime('now')),
        @finishedAt,
        @errorMessage,
        @metadataJson
      )
    `
    )
    .run({
      ...run,
      startedAt: run.startedAt ?? null,
      finishedAt: run.finishedAt ?? null,
      errorMessage: run.errorMessage ?? null,
      metadataJson: run.metadataJson ?? null
    });

  return Number(info.lastInsertRowid);
}

export function updateSourceRun(
  db: Database.Database,
  id: number,
  update: {
    status: SourceRunStatus;
    finishedAt?: string;
    errorMessage?: string | null;
    metadataJson?: string | null;
  }
) {
  db.prepare(
    `
    UPDATE source_runs
    SET
      status = @status,
      finished_at = COALESCE(@finishedAt, datetime('now')),
      error_message = @errorMessage,
      metadata_json = @metadataJson
    WHERE id = @id
  `
  ).run({
    id,
    status: update.status,
    finishedAt: update.finishedAt ?? null,
    errorMessage: update.errorMessage ?? null,
    metadataJson: update.metadataJson ?? null
  });
}

export function markRunningSourceRunsFailed(
  db: Database.Database,
  filters: {
    source: string;
    collectorId: string;
    finishedAt?: string;
    errorMessage: string;
  }
) {
  const info = db.prepare(
    `
    UPDATE source_runs
    SET
      status = 'failure',
      finished_at = @finishedAt,
      error_message = @errorMessage
    WHERE source = @source
      AND collector_id = @collectorId
      AND status = 'running'
  `
  ).run({
    source: filters.source,
    collectorId: filters.collectorId,
    finishedAt: filters.finishedAt ?? new Date().toISOString(),
    errorMessage: filters.errorMessage
  });

  return info.changes;
}

export function getSourceRunById(db: Database.Database, id: number) {
  const row = db.prepare("SELECT * FROM source_runs WHERE id = ?").get(id) as
    | SourceRunDbRow
    | undefined;

  return row ? mapSourceRun(row) : null;
}

export function getLatestSourceRuns(
  db: Database.Database,
  filters: { source?: string; collectorId?: string; limit?: number } = {}
) {
  const conditions: string[] = [];
  const params: Record<string, string | number> = {
    limit: filters.limit ?? 10
  };

  if (filters.source) {
    conditions.push("source = @source");
    params.source = filters.source;
  }

  if (filters.collectorId) {
    conditions.push("collector_id = @collectorId");
    params.collectorId = filters.collectorId;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db
    .prepare(
      `
      SELECT *
      FROM source_runs
      ${whereClause}
      ORDER BY started_at DESC, id DESC
      LIMIT @limit
    `
    )
    .all(params) as SourceRunDbRow[];

  return rows.map(mapSourceRun);
}
