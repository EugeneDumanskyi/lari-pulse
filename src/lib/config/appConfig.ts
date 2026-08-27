import path from "node:path";
import { defaultSymbols } from "./symbols";
import { collectionTimeframes, defaultTimeframes } from "./timeframes";

const defaultDatabasePath = "data/laripulse.sqlite";

export const appConfig = {
  databasePath: path.resolve(process.cwd(), process.env.DATABASE_PATH ?? defaultDatabasePath),
  symbols: defaultSymbols,
  timeframes: defaultTimeframes,
  collectionTimeframes,
  schedulerEnabled: process.env.SCHEDULER_ENABLED === "true",
  collectIntervalSeconds: Number(process.env.COLLECT_INTERVAL_SECONDS ?? 60),
  macroSchedulerEnabled: process.env.MACRO_SCHEDULER_ENABLED === "true",
  macroRefreshIntervalSeconds: Number(process.env.MACRO_REFRESH_INTERVAL_SECONDS ?? 24 * 60 * 60),
  liquidityRuntimeEnabled: process.env.LIQUIDITY_RUNTIME_ENABLED === "true",
  liquidationsRetentionHours: Number(process.env.LIQUIDATIONS_RETENTION_HOURS ?? 90 * 24),
  binanceLiquidationStreamUrl:
    process.env.BINANCE_LIQUIDATION_STREAM_URL ?? "wss://fstream.binance.com/ws/!forceOrder@arr",
  adminEmail: process.env.LARIPULSE_ADMIN_EMAIL || null,
  adminPassword: process.env.LARIPULSE_ADMIN_PASSWORD || null,
  sessionMaxAgeSeconds: Number(process.env.LARIPULSE_SESSION_MAX_AGE_SECONDS ?? 60 * 60 * 24 * 30),
  inviteMaxAgeSeconds: Number(process.env.LARIPULSE_INVITE_MAX_AGE_SECONDS ?? 60 * 60 * 24 * 7)
};
