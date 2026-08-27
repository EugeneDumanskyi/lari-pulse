import type Database from "better-sqlite3";
import { appConfig } from "@/lib/config/appConfig";
import type { RuntimeStatusApi, SourceRunApi } from "@/lib/api/types";
import { getDatabase } from "@/lib/db/client";
import { initializeDatabase } from "@/lib/db/initialize";
import { getLatestSourceRuns } from "@/lib/db/repositories/sourceRunsRepository";
import type { SourceRunRecord } from "@/lib/db/types";
import { getSchedulerState } from "@/lib/scheduler/scheduler";
import {
  BINANCE_LIQUIDATION_STREAM_COLLECTOR_ID,
  BINANCE_LIQUIDATION_STREAM_SOURCE
} from "@/lib/collectors/binanceLiquidationStreamCollector";
import { getLiquidityRuntimeState } from "@/lib/services/liquidityRuntimeService";

function mapSourceRun(run: SourceRunRecord): SourceRunApi {
  return {
    id: run.id,
    source: run.source,
    collectorId: run.collectorId,
    status: run.status,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    errorMessage: run.errorMessage
  };
}

function lastFailureMessage(run: SourceRunRecord | null) {
  if (!run || run.status !== "failure") {
    return null;
  }

  return run.errorMessage ?? `${run.collectorId} failed`;
}

export function getRuntimeStatus(db?: Database.Database): RuntimeStatusApi {
  if (!db) {
    initializeDatabase();
  }

  const database = db ?? getDatabase();
  const latestBinance = getLatestSourceRuns(database, {
    source: "binance",
    collectorId: "binance_ohlcv",
    limit: 1
  }).at(0) ?? null;
  const latestScheduler = getLatestSourceRuns(database, {
    source: "internal",
    collectorId: "market_scheduler",
    limit: 1
  }).at(0) ?? null;
  const latestFred = getLatestSourceRuns(database, {
    source: "fred",
    collectorId: "fred_daily_series",
    limit: 1
  }).at(0) ?? null;
  const latestLiquidationStream = getLatestSourceRuns(database, {
    source: BINANCE_LIQUIDATION_STREAM_SOURCE,
    collectorId: BINANCE_LIQUIDATION_STREAM_COLLECTOR_ID,
    limit: 1
  }).at(0) ?? null;
  const recentRuns = getLatestSourceRuns(database, { limit: 8 }).map(mapSourceRun);
  const warningMessages = [
    lastFailureMessage(latestBinance),
    lastFailureMessage(latestFred),
    lastFailureMessage(latestLiquidationStream),
    lastFailureMessage(latestScheduler)
  ].filter((message): message is string => Boolean(message));
  const liquidityRuntime = getLiquidityRuntimeState();

  return {
    scheduler: getSchedulerState(),
    liquidity: {
      enabled: liquidityRuntime.enabled,
      started: liquidityRuntime.started,
      liquidationsRetentionHours: liquidityRuntime.retentionHours,
      latestRetentionPruneAt: liquidityRuntime.lastRetentionPruneAt,
      latestRetentionPrunedEvents: liquidityRuntime.lastRetentionPrunedEvents,
      liquidationStream: {
        started: liquidityRuntime.liquidationStream.started,
        connected: liquidityRuntime.liquidationStream.connected,
        reconnecting: liquidityRuntime.liquidationStream.reconnecting,
        url: liquidityRuntime.liquidationStream.url,
        symbols: liquidityRuntime.liquidationStream.symbols,
        messagesReceived: liquidityRuntime.liquidationStream.messagesReceived,
        eventsReceived: liquidityRuntime.liquidationStream.eventsReceived,
        eventsStored: liquidityRuntime.liquidationStream.eventsStored,
        lastMessageAt: liquidityRuntime.liquidationStream.lastMessageAt,
        lastError: liquidityRuntime.liquidationStream.lastError,
        reconnectAttempts: liquidityRuntime.liquidationStream.reconnectAttempts,
        sourceRunId: liquidityRuntime.liquidationStream.sourceRunId
      },
      latestLiquidationStreamRun: latestLiquidationStream ? mapSourceRun(latestLiquidationStream) : null
    },
    collection: {
      configuredSymbols: appConfig.symbols.filter((symbol) => symbol.isActive).map((symbol) => symbol.symbol),
      configuredTimeframes: [...appConfig.timeframes],
      latestBinanceRun: latestBinance ? mapSourceRun(latestBinance) : null,
      latestFredRun: latestFred ? mapSourceRun(latestFred) : null,
      latestSchedulerRun: latestScheduler ? mapSourceRun(latestScheduler) : null,
      recentRuns,
      hasCollectorFailure: warningMessages.length > 0,
      warningMessages
    }
  };
}
