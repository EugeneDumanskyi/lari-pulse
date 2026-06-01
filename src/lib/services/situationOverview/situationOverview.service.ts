import type Database from "better-sqlite3";
import { filterVisibleWidgetResults, type AuthSession } from "@/lib/auth/access";
import type { WidgetResultApi } from "@/lib/api/types";
import { appConfig } from "@/lib/config/appConfig";
import { getDatabase } from "@/lib/db/client";
import { initializeDatabase } from "@/lib/db/initialize";
import {
  getLatestSituationOverview,
  insertSituationOverview,
  listSituationOverviewHistory
} from "@/lib/db/repositories/situationOverviewRepository";
import type { SituationOverviewRecord } from "@/lib/db/types";
import { getCrossMarketWidgets } from "@/lib/services/crossMarketWidgetService";
import { evaluateAlertRulesForOverview } from "@/lib/services/alertService";
import { getStoredDashboardMarketOverview } from "@/lib/services/marketDataService";
import { listLatestWidgetResultsWithDerivedLiquidity } from "@/lib/services/widgetResultService";
import { getEffectiveVisibleWidgetIds } from "@/lib/services/widgetSettingsService";
import { widgetCatalog } from "@/lib/widgets/catalog";
import { buildSituationOverview } from "./situationOverview.rules";
import type {
  SituationChange,
  SituationConfidence,
  SituationDataWarning,
  SituationDriver,
  SituationOverview,
  SituationOverviewHistoryItem,
  SituationRiskLevel,
  SituationSourceWidget,
  SituationWatchCondition
} from "./situationOverview.types";

export interface GetSituationOverviewOptions {
  symbol: string;
  timeframe: string;
  session: AuthSession;
  db?: Database.Database;
  now?: Date;
  evaluateAlerts?: boolean;
}

const minimumSnapshotIntervalMs = 15 * 60 * 1000;

function expectedWidgetIdsForSession(session: AuthSession) {
  const visibleWidgetIds = getEffectiveVisibleWidgetIds(session);
  const visibleSet = new Set(visibleWidgetIds);
  const groupAllowed = (widgetId: string) => {
    const item = widgetCatalog.find((entry) => entry.widgetId === widgetId);

    if (!item) {
      return false;
    }

    if (item.group === "cross_market") {
      return session.isAdmin;
    }

    return true;
  };

  return visibleWidgetIds.filter((id) => visibleSet.has(id) && groupAllowed(id));
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function historyItemFromRecord(record: SituationOverviewRecord): SituationOverviewHistoryItem {
  const mainDrivers = parseJson<SituationDriver[]>(record.mainDriversJson, []);
  const changes = parseJson<SituationChange[]>(record.changesJson, []);

  return {
    id: record.id,
    symbol: record.symbol,
    timeframe: record.timeframe,
    generatedAt: record.generatedAt,
    title: record.title,
    summary: record.summary,
    bias: record.bias as SituationOverviewHistoryItem["bias"],
    riskLevel: record.riskLevel as SituationRiskLevel,
    confidence: record.confidence as SituationConfidence,
    score: record.score,
    riskScore: record.riskScore,
    topDriver: mainDrivers[0]?.label ?? null,
    changeLabels: changes.map((change) => change.label).slice(0, 3)
  };
}

function overviewFromRecord(record: SituationOverviewRecord): SituationOverview {
  return {
    symbol: record.symbol,
    timeframe: record.timeframe,
    generatedAt: record.generatedAt,
    title: record.title,
    summary: record.summary,
    bias: record.bias as SituationOverview["bias"],
    riskLevel: record.riskLevel as SituationRiskLevel,
    confidence: record.confidence as SituationConfidence,
    score: record.score,
    riskScore: record.riskScore,
    mainDrivers: parseJson<SituationDriver[]>(record.mainDriversJson, []),
    conflictingSignals: parseJson<SituationDriver[]>(record.conflictingSignalsJson, []),
    watchConditions: parseJson<SituationWatchCondition[]>(record.watchConditionsJson, []),
    dataWarnings: parseJson<SituationDataWarning[]>(record.dataWarningsJson, []),
    changedSincePrevious: parseJson<SituationChange[]>(record.changesJson, []),
    sourceWidgets: parseJson<SituationSourceWidget[]>(record.sourceWidgetsJson, []),
    meta: parseJson<SituationOverview["meta"]>(record.metaJson, {
      missingInputs: [],
      staleInputs: [],
      usedFallbacks: [],
      isPartial: true
    })
  };
}

function shouldPersistOverview(
  previous: SituationOverviewRecord | null,
  overview: SituationOverview,
  now: Date
) {
  if (!previous) {
    return true;
  }

  if ((overview.changedSincePrevious ?? []).length > 0) {
    return true;
  }

  const previousTime = new Date(previous.generatedAt).getTime();

  if (!Number.isFinite(previousTime)) {
    return true;
  }

  return now.getTime() - previousTime >= minimumSnapshotIntervalMs;
}

function persistOverview(
  db: Database.Database,
  overview: SituationOverview,
  accessPlan: AuthSession["plan"]
) {
  return insertSituationOverview(db, {
    symbol: overview.symbol,
    timeframe: overview.timeframe,
    accessPlan,
    generatedAt: overview.generatedAt,
    title: overview.title,
    summary: overview.summary,
    bias: overview.bias,
    riskLevel: overview.riskLevel,
    confidence: overview.confidence,
    score: overview.score,
    riskScore: overview.riskScore,
    mainDriversJson: JSON.stringify(overview.mainDrivers),
    conflictingSignalsJson: JSON.stringify(overview.conflictingSignals),
    watchConditionsJson: JSON.stringify(overview.watchConditions),
    dataWarningsJson: JSON.stringify(overview.dataWarnings),
    changesJson: JSON.stringify(overview.changedSincePrevious ?? []),
    sourceWidgetsJson: JSON.stringify(overview.sourceWidgets),
    metaJson: JSON.stringify(overview.meta)
  });
}

export function listSituationOverviewTimeline(options: GetSituationOverviewOptions & { limit?: number }) {
  if (!options.db) {
    initializeDatabase();
  }

  const db = options.db ?? getDatabase();
  return listSituationOverviewHistory(db, {
    symbol: options.symbol,
    timeframe: options.timeframe,
    accessPlan: options.session.plan,
    limit: options.limit ?? 50
  }).map(historyItemFromRecord);
}

export async function getSituationOverview(options: GetSituationOverviewOptions): Promise<SituationOverview> {
  if (!options.db) {
    initializeDatabase();
  }

  const db = options.db ?? getDatabase();
  const now = options.now ?? new Date();
  const visibleWidgetIds = getEffectiveVisibleWidgetIds(options.session);
  const expectedWidgetIds = expectedWidgetIdsForSession(options.session);
  const cryptoWidgets = filterVisibleWidgetResults(
    await listLatestWidgetResultsWithDerivedLiquidity(
      {
        symbol: options.symbol,
        timeframe: options.timeframe
      },
      db
    ),
    {
      ...options.session,
      visibleWidgetIds
    }
  );
  let crossMarketWidgets: WidgetResultApi[] = [];

  if (options.session.isAdmin) {
    const crossMarket = await getCrossMarketWidgets({
      timeframe: "1d",
      db,
      visibleWidgetIds
    });
    crossMarketWidgets = crossMarket.results;
  }

  const marketOverview = getStoredDashboardMarketOverview(
    {
      symbol: options.symbol,
      timeframe: options.timeframe,
      limit: 120
    },
    db
  );
  const previousRecord = getLatestSituationOverview(db, {
    symbol: options.symbol,
    timeframe: options.timeframe,
    accessPlan: options.session.plan
  });
  const previousOverview = previousRecord ? overviewFromRecord(previousRecord) : null;
  const overview = buildSituationOverview({
    symbol: options.symbol,
    timeframe: options.timeframe,
    generatedAt: now,
    widgets: cryptoWidgets,
    crossMarketWidgets,
    marketOverview,
    expectedWidgetIds,
    previousOverview
  });

  let persistedOverviewId: number | null = null;

  if (shouldPersistOverview(previousRecord, overview, now)) {
    persistedOverviewId = persistOverview(db, overview, options.session.plan);
  }

  if (options.evaluateAlerts !== false) {
    evaluateAlertRulesForOverview({
      db,
      overview,
      previousOverview,
      accessPlan: options.session.plan,
      overviewId: persistedOverviewId
    });
  }

  overview.history = listSituationOverviewHistory(db, {
    symbol: options.symbol,
    timeframe: options.timeframe,
    accessPlan: options.session.plan,
    limit: 6
  }).map(historyItemFromRecord);

  return overview;
}

export function defaultSituationSymbol() {
  return appConfig.symbols[0]?.symbol ?? "BTCUSDT";
}

export function defaultSituationTimeframe() {
  return appConfig.timeframes.includes("1h" as (typeof appConfig.timeframes)[number]) ? "1h" : appConfig.timeframes[0];
}

export function clearSituationOverviewCache() {
  // Retained for tests and older call sites. Situation history is now persisted in SQLite.
}
