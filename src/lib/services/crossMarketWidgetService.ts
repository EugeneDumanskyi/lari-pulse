import type Database from "better-sqlite3";
import type {
  CrossMarketAssetStatusApi,
  CrossMarketCorrelationApi,
  CrossMarketWidgetsApi,
  WidgetResultApi
} from "@/lib/api/types";
import { defaultSymbols, crossMarketSymbols, type AppSymbolConfig } from "@/lib/config/symbols";
import { calculateCorrelationPairs } from "@/lib/services/correlationService";
import { getDatabase } from "@/lib/db/client";
import { initializeDatabase } from "@/lib/db/initialize";
import { getCandlesBySymbolTimeframe } from "@/lib/db/repositories/candlesRepository";
import type { CandleRecord } from "@/lib/db/types";
import { buildCrossMarketContext } from "@/lib/widgets/marketContext";
import { crossMarketWidgets } from "@/lib/widgets/crossMarket";
import type { WidgetResult } from "@/lib/widgets/types";
import { runWidgetEngine } from "@/lib/widgets/runner";
import { sortByWidgetPriority } from "@/lib/widgets/catalog";

export interface CrossMarketWidgetOptions {
  timeframe?: string;
  candleLimit?: number;
  now?: Date;
  db?: Database.Database;
  saveResults?: boolean;
  visibleWidgetIds?: string[];
}

const DEFAULT_TIMEFRAME = "1d";
const DEFAULT_CANDLE_LIMIT = 260;
const DAILY_STALE_MS = 5 * 24 * 60 * 60 * 1000;

const contextSymbols: AppSymbolConfig[] = [
  ...defaultSymbols.filter((symbol) => ["BTCUSDT", "ETHUSDT", "SOLUSDT"].includes(symbol.symbol)),
  ...crossMarketSymbols
];

function round(value: number, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function latestCandle(candles: CandleRecord[]) {
  return candles.length > 0 ? candles[candles.length - 1] : null;
}

function latestUpdatedAt(assetCandles: Record<string, Record<string, CandleRecord[]>>, timeframe: string, now: Date) {
  const times = Object.values(assetCandles)
    .map((timeframes) => latestCandle(timeframes[timeframe] ?? [])?.closeTime)
    .filter((time): time is number => typeof time === "number");

  if (times.length === 0) {
    return now.toISOString();
  }

  return new Date(Math.max(...times)).toISOString();
}

function toWidgetResultApi(result: WidgetResult, id: number): WidgetResultApi {
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

function assetStatus(
  config: AppSymbolConfig,
  candles: CandleRecord[],
  now: Date
): CrossMarketAssetStatusApi {
  const latest = latestCandle(candles);
  const previous = candles.at(-2);
  const changePercent =
    latest && previous && previous.close !== 0 ? ((latest.close - previous.close) / previous.close) * 100 : null;
  const updatedAt = latest ? new Date(latest.closeTime).toISOString() : null;
  const isStale = latest ? now.getTime() - latest.closeTime > DAILY_STALE_MS : true;

  return {
    symbol: config.symbol,
    displayName: config.displayName ?? config.symbol,
    assetType: config.assetType,
    source: config.source,
    latestValue: latest ? round(latest.close) : null,
    changePercent: changePercent === null ? null : round(changePercent, 2),
    candleCount: candles.length,
    updatedAt,
    isMissing: candles.length === 0,
    isStale
  };
}

function correlationApi(pair: ReturnType<typeof calculateCorrelationPairs>["pairs"][number]): CrossMarketCorrelationApi {
  return {
    id: pair.id,
    label: pair.label,
    leftSymbol: pair.leftSymbol,
    rightSymbol: pair.rightSymbol,
    timeframe: pair.timeframe,
    latestCorrelation: pair.latestCorrelation === null ? null : round(pair.latestCorrelation, 3),
    observations: pair.observations,
    divergencePercent: pair.divergence.spread === null ? null : round(pair.divergence.spread * 100, 2),
    warnings: pair.warnings,
    updatedAt: pair.updatedAt
  };
}

export async function getCrossMarketWidgets(
  options: CrossMarketWidgetOptions = {}
): Promise<CrossMarketWidgetsApi> {
  if (!options.db) {
    initializeDatabase();
  }

  const db = options.db ?? getDatabase();
  const timeframe = options.timeframe ?? DEFAULT_TIMEFRAME;
  const candleLimit = options.candleLimit ?? DEFAULT_CANDLE_LIMIT;
  const now = options.now ?? new Date();
  const assetCandles = Object.fromEntries(
    contextSymbols.map((config) => [
      config.symbol,
      {
        [timeframe]: getCandlesBySymbolTimeframe(db, config.symbol, timeframe, candleLimit)
      }
    ])
  ) as Record<string, Record<string, CandleRecord[]>>;
  const correlations = calculateCorrelationPairs({
    db,
    timeframe,
    candleLimit
  });
  const context = {
    symbol: "CROSS_MARKET",
    timeframe,
    marketContext: buildCrossMarketContext({
      assetCandles,
      correlations: correlations.pairs,
      latestCandleUpdatedAt: latestUpdatedAt(assetCandles, timeframe, now),
      metadata: {
        mode: "on_demand_api"
      }
    }),
    now
  };
  const outcomes = [];

  const allowedWidgetIds = options.visibleWidgetIds ? new Set(options.visibleWidgetIds) : null;
  const selectedWidgets = sortByWidgetPriority(
    crossMarketWidgets.filter((widget) => !allowedWidgetIds || allowedWidgetIds.has(widget.id)).map((widget) => ({
      widgetId: widget.id,
      widget
    }))
  ).map((entry) => entry.widget);

  for (const widget of selectedWidgets) {
    outcomes.push(await runWidgetEngine(widget, context, {
      db,
      save: options.saveResults === true
    }));
  }

  const results = sortByWidgetPriority(
    outcomes.flatMap((outcome, index) =>
      outcome.status === "success" ? [toWidgetResultApi(outcome.result, outcome.savedRowId ?? -(index + 1))] : []
    )
  );
  const assetStatuses = contextSymbols.map((config) => assetStatus(config, assetCandles[config.symbol][timeframe], now));
  const warnings = [
    ...assetStatuses
      .filter((status) => status.isMissing)
      .map((status) => `${status.symbol} has no stored ${timeframe} candles`),
    ...assetStatuses
      .filter((status) => !status.isMissing && status.isStale)
      .map((status) => `${status.symbol} ${timeframe} data is stale; latest update ${status.updatedAt}`),
    ...outcomes
      .filter((outcome) => outcome.status === "failure")
      .map((outcome) => `${outcome.widgetId}: ${outcome.error}`)
  ];

  return {
    timeframe,
    results,
    assetStatuses,
    correlations: correlations.pairs.map(correlationApi),
    warnings,
    updatedAt: new Date().toISOString()
  };
}
