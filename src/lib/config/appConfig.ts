import path from "node:path";
import { defaultSymbols } from "./symbols";
import { defaultTimeframes } from "./timeframes";

const defaultDatabasePath = "data/laripulse.sqlite";

export const appConfig = {
  phase: process.env.LARIPULSE_PHASE ?? "phase1",
  databasePath: path.resolve(process.cwd(), process.env.DATABASE_PATH ?? defaultDatabasePath),
  symbols: defaultSymbols,
  timeframes: defaultTimeframes,
  schedulerEnabled: process.env.SCHEDULER_ENABLED === "true",
  collectIntervalSeconds: Number(process.env.COLLECT_INTERVAL_SECONDS ?? 60),
  phase2SchedulerEnabled: process.env.PHASE2_SCHEDULER_ENABLED === "true",
  phase2RefreshIntervalSeconds: Number(process.env.PHASE2_REFRESH_INTERVAL_SECONDS ?? 24 * 60 * 60)
};
