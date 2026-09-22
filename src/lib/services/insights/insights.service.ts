import type Database from "better-sqlite3";
import { hasRole, requireRole, type AuthSession } from "@/lib/auth/access";
import { getDatabase } from "@/lib/db/client";
import { initializeDatabase } from "@/lib/db/initialize";
import { countAlertEventsInRange, listAlertEventsInRange } from "@/lib/db/repositories/alertRepository";
import {
  countSituationOverviewsInRange,
  listSituationOverviewsInRange
} from "@/lib/db/repositories/situationOverviewRepository";
import type { AlertEventRecord, SituationOverviewRecord } from "@/lib/db/types";
import {
  validateCollectionTimeframe,
  validateSymbol,
  validateSymbolAccess
} from "@/lib/services/apiValidation";
import {
  defaultSituationSymbol,
  defaultSituationTimeframe
} from "@/lib/services/situationOverview/situationOverview.service";
import type {
  SituationBias,
  SituationConfidence,
  SituationDriver,
  SituationRiskLevel,
  SituationWatchCondition
} from "@/lib/services/situationOverview/situationOverview.types";
import {
  buildInsightSections,
  maxAlertEventsPerWindow,
  maxSnapshotsPerWindow
} from "./insights.rules";
import type {
  InsightAlertEvent,
  InsightRange,
  InsightSnapshot,
  InsightWindow,
  InsightsResponse
} from "./insights.types";

export interface GetInsightsOptions {
  session: AuthSession;
  symbol?: string;
  timeframe?: string;
  range?: InsightRange;
  db?: Database.Database;
  now?: Date;
}

const rangeMs: Record<InsightRange, number> = {
  "1d": 86_400_000,
  "7d": 604_800_000,
  "30d": 2_592_000_000,
  "90d": 7_776_000_000
};

const defaultRange: InsightRange = "7d";

/**
 * The one definition of what each range means. Reports composes a window of
 * its own for its header and for every section it carries, so the arithmetic
 * is exported rather than duplicated — a second table would drift the first
 * time one of the two features gained a range.
 */
export function windowForRange(range: InsightRange, now: Date): InsightWindow {
  return {
    from: new Date(now.getTime() - rangeMs[range]).toISOString(),
    to: now.toISOString()
  };
}

/**
 * A bound is formatted per table, never once and reused. `generated_at` holds
 * an ISO string; `created_at` takes the `datetime('now')` default, which is
 * UTC with a space separator, no `T` and no zone marker.
 */
function situationOverviewBound(at: Date) {
  return at.toISOString();
}

function alertEventBound(at: Date) {
  return at.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * `new Date("2026-09-19 11:01:12")` parses as local time, so every stored
 * alert timestamp is normalised to ISO before it reaches the pure layer.
 */
function toIsoTimestamp(stored: string) {
  return `${stored.replace(" ", "T")}Z`;
}

/** One unparseable row contributes an empty list rather than throwing. */
function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function snapshotFromRecord(record: SituationOverviewRecord): InsightSnapshot {
  const meta = parseJson<Partial<InsightSnapshot["meta"]>>(record.metaJson, {});

  return {
    id: record.id,
    generatedAt: record.generatedAt,
    // The columns are TEXT; an unrecognised value flows into the text as
    // itself rather than being dropped, which keeps an old row readable.
    bias: record.bias as SituationBias,
    riskLevel: record.riskLevel as SituationRiskLevel,
    confidence: record.confidence as SituationConfidence,
    mainDrivers: parseJson<SituationDriver[]>(record.mainDriversJson, []),
    conflictingSignals: parseJson<SituationDriver[]>(record.conflictingSignalsJson, []),
    watchConditions: parseJson<SituationWatchCondition[]>(record.watchConditionsJson, []),
    meta: {
      missingInputs: meta.missingInputs ?? [],
      staleInputs: meta.staleInputs ?? [],
      usedFallbacks: meta.usedFallbacks ?? [],
      isPartial: meta.isPartial === true
    }
  };
}

function alertFromRecord(record: AlertEventRecord): InsightAlertEvent {
  return {
    id: record.id,
    createdAt: toIsoTimestamp(record.createdAt),
    severity: record.severity,
    title: record.title,
    symbol: record.symbol,
    timeframe: record.timeframe,
    acknowledged: record.acknowledgedAt !== null
  };
}

/**
 * Reads a window of already persisted snapshots and, for an analyst, their own
 * alert events, and composes the eight sections from them. It is synchronous
 * and writes nothing: no snapshot, no alert event, no cache entry.
 */
export function getInsights(options: GetInsightsOptions): InsightsResponse {
  requireRole(options.session, "viewer");

  const symbol = validateSymbolAccess(
    validateSymbol(options.symbol ?? defaultSituationSymbol()),
    options.session
  );
  const timeframe = validateCollectionTimeframe(options.timeframe ?? defaultSituationTimeframe());
  const range = options.range ?? defaultRange;

  if (!options.db) {
    initializeDatabase();
  }

  const db = options.db ?? getDatabase();
  const now = options.now ?? new Date();
  const requestedWindow = windowForRange(range, now);
  const from = new Date(requestedWindow.from);
  const snapshotFilters = {
    symbol,
    timeframe,
    from: situationOverviewBound(from),
    to: situationOverviewBound(now)
  };
  const records = listSituationOverviewsInRange(db, {
    ...snapshotFilters,
    limit: maxSnapshotsPerWindow
  });
  const snapshotsTruncated = records.length === maxSnapshotsPerWindow;
  const snapshotsLeftOut = snapshotsTruncated
    ? Math.max(0, countSituationOverviewsInRange(db, snapshotFilters) - records.length)
    : 0;
  // The repository answers newest-first; this is the one place the order flips.
  const snapshots = records.reverse().map(snapshotFromRecord);

  // `alert-activity` needs analyst and a signed-in user, and is omitted rather
  // than broadened or turned into a 403 on the whole request.
  const user =
    hasRole(options.session, "analyst") && options.session.userId !== null ? options.session : null;
  let alerts: InsightAlertEvent[] | null = null;
  let alertsTruncated = false;
  let alertsLeftOut = 0;

  if (user?.userId != null) {
    const alertFilters = {
      userId: user.userId,
      from: alertEventBound(from),
      to: alertEventBound(now)
    };
    const events = listAlertEventsInRange(db, { ...alertFilters, limit: maxAlertEventsPerWindow });

    alertsTruncated = events.length === maxAlertEventsPerWindow;
    alertsLeftOut = alertsTruncated
      ? Math.max(0, countAlertEventsInRange(db, alertFilters) - events.length)
      : 0;
    alerts = events.map(alertFromRecord);
  }

  return {
    symbol,
    timeframe,
    range,
    requestedWindow,
    coveredWindow:
      snapshots.length > 0
        ? { from: snapshots[0].generatedAt, to: snapshots[snapshots.length - 1].generatedAt }
        : null,
    snapshotCount: snapshots.length,
    truncated: snapshotsTruncated,
    generatedAt: now.toISOString(),
    sections: buildInsightSections({
      range,
      requestedWindow,
      snapshots,
      snapshotsTruncated,
      snapshotsLeftOut,
      alerts,
      alertsTruncated,
      alertsLeftOut
    })
  };
}
