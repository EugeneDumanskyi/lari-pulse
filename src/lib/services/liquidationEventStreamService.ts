import type Database from "better-sqlite3";
import { appConfig } from "@/lib/config/appConfig";
import { getDatabase } from "@/lib/db/client";
import { initializeDatabase } from "@/lib/db/initialize";
import {
  aggregateLiquidationEvents,
  deleteOldLiquidationEvents,
  type LiquidationEventAggregate
} from "@/lib/db/repositories/liquidityRepository";
import {
  insertSourceRun,
  markRunningSourceRunsFailed,
  updateSourceRun
} from "@/lib/db/repositories/sourceRunsRepository";
import {
  BINANCE_LIQUIDATION_STREAM_COLLECTOR_ID,
  BINANCE_LIQUIDATION_STREAM_SOURCE,
  BINANCE_LIQUIDATION_STREAM_URL,
  BinanceLiquidationEventStream,
  type BinanceLiquidationStreamOptions,
  type BinanceLiquidationStreamState
} from "@/lib/collectors/binanceLiquidationStreamCollector";

export interface LiquidationIntervalSummary extends LiquidationEventAggregate {
  timeframe: string;
  longShare: number;
  shortShare: number;
  netPressure: "long_liquidations" | "short_liquidations" | "balanced";
  collector: {
    started: boolean;
    connected: boolean;
    reconnecting: boolean;
    lastError: string | null;
    messagesReceived: number;
    eventsReceived: number;
    eventsStored: number;
    sourceRunId: number | null;
  };
}

export interface LiquidationEventStreamRuntimeState extends BinanceLiquidationStreamState {
  sourceRunId: number | null;
  retentionHours: number;
}

const timeframeDurationsMs: Record<string, number> = {
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000
};

interface LiquidationEventStreamGlobalState {
  stream: BinanceLiquidationEventStream | null;
  sourceRunId: number | null;
}

const globalState = globalThis as typeof globalThis & {
  __lariPulseLiquidationEventStream?: LiquidationEventStreamGlobalState;
};

function runtimeState() {
  globalState.__lariPulseLiquidationEventStream ??= {
    stream: null,
    sourceRunId: null
  };

  return globalState.__lariPulseLiquidationEventStream;
}

function defaultCryptoSymbols() {
  return appConfig.symbols
    .filter((symbol) => symbol.assetType === "crypto" && symbol.isActive)
    .map((symbol) => symbol.symbol);
}

function normalizeRetentionHours() {
  const value = appConfig.liquidationsRetentionHours;

  if (!Number.isFinite(value) || value < 1) {
    return 90 * 24;
  }

  return Math.max(90 * 24, Math.floor(value));
}

function timeframeDurationMs(timeframe: string) {
  const duration = timeframeDurationsMs[timeframe];

  if (!duration) {
    throw new Error(`Unsupported liquidation aggregation timeframe: ${timeframe}`);
  }

  return duration;
}

function bucketSizeMs(timeframe: string) {
  switch (timeframe) {
    case "15m":
      return 60 * 1000;
    case "1h":
      return 5 * 60 * 1000;
    case "4h":
      return 15 * 60 * 1000;
    case "1d":
      return 60 * 60 * 1000;
    case "7d":
      return 6 * 60 * 60 * 1000;
    case "30d":
      return 24 * 60 * 60 * 1000;
    case "90d":
      return 3 * 24 * 60 * 60 * 1000;
    default:
      throw new Error(`Unsupported liquidation aggregation timeframe: ${timeframe}`);
  }
}

function collectorSnapshot() {
  const state = getBinanceLiquidationEventStreamState();

  return {
    started: state.started,
    connected: state.connected,
    reconnecting: state.reconnecting,
    lastError: state.lastError,
    messagesReceived: state.messagesReceived,
    eventsReceived: state.eventsReceived,
    eventsStored: state.eventsStored,
    sourceRunId: state.sourceRunId
  };
}

function emptyState(): LiquidationEventStreamRuntimeState {
  return {
    started: false,
    connected: false,
    reconnecting: false,
    url: appConfig.binanceLiquidationStreamUrl ?? BINANCE_LIQUIDATION_STREAM_URL,
    symbols: defaultCryptoSymbols(),
    messagesReceived: 0,
    eventsReceived: 0,
    eventsStored: 0,
    lastMessageAt: null,
    lastError: null,
    reconnectAttempts: 0,
    sourceRunId: runtimeState().sourceRunId,
    retentionHours: normalizeRetentionHours()
  };
}

export function startBinanceLiquidationEventStream(
  options: Partial<BinanceLiquidationStreamOptions> = {}
) {
  if (!options.db) {
    initializeDatabase();
  }

  const db = options.db ?? getDatabase();
  const state = runtimeState();

  if (state.stream) {
    return getBinanceLiquidationEventStreamState();
  }

  const symbols = options.symbols ?? defaultCryptoSymbols();
  markRunningSourceRunsFailed(db, {
    source: BINANCE_LIQUIDATION_STREAM_SOURCE,
    collectorId: BINANCE_LIQUIDATION_STREAM_COLLECTOR_ID,
    errorMessage: "Stale liquidation stream run was superseded by a new runtime start"
  });
  state.sourceRunId = insertSourceRun(db, {
    source: BINANCE_LIQUIDATION_STREAM_SOURCE,
    collectorId: BINANCE_LIQUIDATION_STREAM_COLLECTOR_ID,
    status: "running",
    startedAt: new Date().toISOString(),
    metadataJson: JSON.stringify({
      stream: "!forceOrder@arr",
      url: options.url ?? appConfig.binanceLiquidationStreamUrl,
      symbols
    })
  });

  state.stream = new BinanceLiquidationEventStream({
    ...options,
    db,
    symbols,
    url: options.url ?? appConfig.binanceLiquidationStreamUrl
  });
  state.stream.start();

  return getBinanceLiquidationEventStreamState();
}

export function stopBinanceLiquidationEventStream(db?: Database.Database) {
  const state = runtimeState();

  if (!state.stream) {
    return getBinanceLiquidationEventStreamState();
  }

  const finalState = state.stream.stop();
  state.stream = null;

  if (state.sourceRunId) {
    const database = db ?? getDatabase();
    updateSourceRun(database, state.sourceRunId, {
      status: finalState.lastError ? "failure" : "success",
      finishedAt: new Date().toISOString(),
      errorMessage: finalState.lastError,
      metadataJson: JSON.stringify({
        stream: "!forceOrder@arr",
        messagesReceived: finalState.messagesReceived,
        eventsReceived: finalState.eventsReceived,
        eventsStored: finalState.eventsStored,
        lastMessageAt: finalState.lastMessageAt,
        reconnectAttempts: finalState.reconnectAttempts
      })
    });
  }

  state.sourceRunId = null;

  return getBinanceLiquidationEventStreamState();
}

export function getBinanceLiquidationEventStreamState(): LiquidationEventStreamRuntimeState {
  const state = runtimeState();

  if (!state.stream) {
    return emptyState();
  }

  return {
    ...state.stream.getState(),
    sourceRunId: state.sourceRunId,
    retentionHours: normalizeRetentionHours()
  };
}

export function getLiquidationIntervalSummary(
  filters: {
    symbol: string;
    timeframe: string;
    now?: Date;
  },
  db?: Database.Database
): LiquidationIntervalSummary {
  const database = db ?? getDatabase();
  const toTime = filters.now?.getTime() ?? Date.now();
  const fromTime = toTime - timeframeDurationMs(filters.timeframe);
  const aggregate = aggregateLiquidationEvents(database, {
    symbol: filters.symbol,
    fromTime,
    toTime,
    source: BINANCE_LIQUIDATION_STREAM_SOURCE,
    bucketSizeMs: bucketSizeMs(filters.timeframe)
  });
  const longShare = aggregate.totalLiquidatedUsd > 0
    ? aggregate.longLiquidatedUsd / aggregate.totalLiquidatedUsd
    : 0;
  const shortShare = aggregate.totalLiquidatedUsd > 0
    ? aggregate.shortLiquidatedUsd / aggregate.totalLiquidatedUsd
    : 0;
  const pressureDelta = longShare - shortShare;

  return {
    ...aggregate,
    timeframe: filters.timeframe,
    longShare,
    shortShare,
    netPressure:
      Math.abs(pressureDelta) < 0.1
        ? "balanced"
        : pressureDelta > 0
          ? "long_liquidations"
          : "short_liquidations",
    collector: collectorSnapshot()
  };
}

export function pruneOldLiquidationEvents(db?: Database.Database) {
  const database = db ?? getDatabase();
  const olderThanTime = Date.now() - normalizeRetentionHours() * 60 * 60 * 1000;

  return deleteOldLiquidationEvents(database, olderThanTime);
}
