import type Database from "better-sqlite3";
import { appConfig } from "@/lib/config/appConfig";
import { getDatabase } from "@/lib/db/client";
import { initializeDatabase } from "@/lib/db/initialize";
import {
  getBinanceLiquidationEventStreamState,
  pruneOldLiquidationEvents,
  startBinanceLiquidationEventStream,
  stopBinanceLiquidationEventStream,
  type LiquidationEventStreamRuntimeState
} from "@/lib/services/liquidationEventStreamService";

export interface LiquidityRuntimeState {
  enabled: boolean;
  started: boolean;
  retentionHours: number;
  lastRetentionPruneAt: string | null;
  lastRetentionPrunedEvents: number | null;
  liquidationStream: LiquidationEventStreamRuntimeState;
}

type TimerHandle = ReturnType<typeof setInterval>;

const RETENTION_INTERVAL_MS = 60 * 60 * 1000;

let retentionTimer: TimerHandle | null = null;
let lastRetentionPruneAt: string | null = null;
let lastRetentionPrunedEvents: number | null = null;

function normalizedRetentionHours() {
  const value = appConfig.liquidationsRetentionHours;

  if (!Number.isFinite(value) || value < 1) {
    return 48;
  }

  return Math.floor(value);
}

function databaseFromOptional(db?: Database.Database) {
  if (!db) {
    initializeDatabase();
  }

  return db ?? getDatabase();
}

export function getLiquidityRuntimeState(): LiquidityRuntimeState {
  return {
    enabled: appConfig.liquidityRuntimeEnabled,
    started: retentionTimer !== null || getBinanceLiquidationEventStreamState().started,
    retentionHours: normalizedRetentionHours(),
    lastRetentionPruneAt,
    lastRetentionPrunedEvents,
    liquidationStream: getBinanceLiquidationEventStreamState()
  };
}

export function runLiquidityRetentionCleanup(db?: Database.Database) {
  const database = databaseFromOptional(db);
  const prunedEvents = pruneOldLiquidationEvents(database);

  lastRetentionPruneAt = new Date().toISOString();
  lastRetentionPrunedEvents = prunedEvents;

  return prunedEvents;
}

export function startLiquidityRuntime() {
  initializeDatabase();

  if (!appConfig.liquidityRuntimeEnabled) {
    return getLiquidityRuntimeState();
  }

  const db = getDatabase();

  startBinanceLiquidationEventStream({ db });

  if (!retentionTimer) {
    retentionTimer = setInterval(() => {
      try {
        runLiquidityRetentionCleanup();
      } catch (error) {
        console.error("[liquidity-runtime] Liquidation retention cleanup failed", error);
      }
    }, RETENTION_INTERVAL_MS);

    retentionTimer.unref?.();
  }

  runLiquidityRetentionCleanup(db);

  return getLiquidityRuntimeState();
}

export function stopLiquidityRuntimeForTests(db?: Database.Database) {
  if (retentionTimer) {
    clearInterval(retentionTimer);
    retentionTimer = null;
  }

  const state = getBinanceLiquidationEventStreamState();

  if (state.started) {
    stopBinanceLiquidationEventStream(db);
  }

  lastRetentionPruneAt = null;
  lastRetentionPrunedEvents = null;
}
