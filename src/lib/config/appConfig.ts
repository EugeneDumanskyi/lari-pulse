import path from "node:path";
import { defaultSymbols } from "./symbols";
import { collectionTimeframes, defaultTimeframes } from "./timeframes";

const defaultDatabasePath = "data/laripulse.sqlite";

export const appConfig = {
  phase: process.env.LARIPULSE_PHASE ?? "phase1",
  databasePath: path.resolve(process.cwd(), process.env.DATABASE_PATH ?? defaultDatabasePath),
  symbols: defaultSymbols,
  timeframes: defaultTimeframes,
  collectionTimeframes,
  schedulerEnabled: process.env.SCHEDULER_ENABLED === "true",
  collectIntervalSeconds: Number(process.env.COLLECT_INTERVAL_SECONDS ?? 60),
  phase2SchedulerEnabled: process.env.PHASE2_SCHEDULER_ENABLED === "true",
  phase2RefreshIntervalSeconds: Number(process.env.PHASE2_REFRESH_INTERVAL_SECONDS ?? 24 * 60 * 60),
  liquidityRuntimeEnabled: process.env.LIQUIDITY_RUNTIME_ENABLED === "true",
  liquidationsRetentionHours: Number(process.env.LIQUIDATIONS_RETENTION_HOURS ?? 90 * 24),
  binanceLiquidationStreamUrl:
    process.env.BINANCE_LIQUIDATION_STREAM_URL ?? "wss://fstream.binance.com/ws/!forceOrder@arr"
};
