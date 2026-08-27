import type Database from "better-sqlite3";
import { appConfig } from "@/lib/config/appConfig";
import { getDatabase } from "@/lib/db/client";
import { initializeDatabase } from "@/lib/db/initialize";
import {
  getLatestSourceRuns,
  insertSourceRun,
  updateSourceRun
} from "@/lib/db/repositories/sourceRunsRepository";
import type { SourceRunStatus } from "@/lib/db/types";
import { runCryptoRefresh, type CryptoRefreshResult } from "@/lib/services/cryptoRefreshService";
import { runMacroRefresh, type MacroRefreshResult } from "@/lib/services/macroRefreshService";

export interface SchedulerCycleResult {
  status: "ok" | "partial" | "error" | "skipped";
  startedAt: string;
  finishedAt: string;
  reason: string;
  sourceRunId?: number;
  refresh?: CryptoRefreshResult;
  macroRefresh?: MacroRefreshResult;
  message?: string;
}

export interface SchedulerState {
  enabled: boolean;
  started: boolean;
  running: boolean;
  intervalSeconds: number;
  lastRunAt: string | null;
  lastStatus: SchedulerCycleResult["status"] | null;
  macroEnabled: boolean;
  macroIntervalSeconds: number;
  lastMacroRunAt: string | null;
  lastMacroStatus: SchedulerCycleResult["status"] | null;
}

type TimerHandle = ReturnType<typeof setInterval>;

const SCHEDULER_SOURCE = "internal";
const SCHEDULER_COLLECTOR_ID = "market_scheduler";

let timer: TimerHandle | null = null;
let running = false;
let lastRunAt: string | null = null;
let lastStatus: SchedulerCycleResult["status"] | null = null;
let lastMacroRunAt: string | null = null;
let lastMacroStatus: SchedulerCycleResult["status"] | null = null;

function intervalSeconds() {
  const value = appConfig.collectIntervalSeconds;

  if (!Number.isFinite(value) || value < 10) {
    return 60;
  }

  return Math.floor(value);
}

function macroIntervalSeconds() {
  const value = appConfig.macroRefreshIntervalSeconds;

  if (!Number.isFinite(value) || value < 60 * 60) {
    return 24 * 60 * 60;
  }

  return Math.floor(value);
}

function latestPersistedMacroRunAt(db: Database.Database) {
  const latestFredSuccess = getLatestSourceRuns(db, {
    source: "fred",
    collectorId: "fred_daily_series",
    limit: 8
  }).find((run) => run.status === "success" && run.finishedAt);

  return latestFredSuccess?.finishedAt ?? null;
}

function isMacroDue(now: Date, db: Database.Database) {
  if (!appConfig.macroSchedulerEnabled) {
    return false;
  }

  const latestRunAt = lastMacroRunAt ?? latestPersistedMacroRunAt(db);

  if (!latestRunAt) {
    return true;
  }

  return now.getTime() - new Date(latestRunAt).getTime() >= macroIntervalSeconds() * 1000;
}

function sourceRunStatus(status: SchedulerCycleResult["status"]): SourceRunStatus {
  return status === "ok" ? "success" : "failure";
}

function summarizeRefresh(refresh: CryptoRefreshResult) {
  return JSON.stringify({
    status: refresh.status,
    collection: {
      status: refresh.collection.status,
      sourceRunId: refresh.collection.sourceRunId,
      candlesFetched: refresh.collection.candlesFetched,
      candlesInsertedOrUpdated: refresh.collection.candlesInsertedOrUpdated,
      errors: refresh.collection.errors
    },
    widgetCalculation: refresh.widgetCalculation
      ? {
          status: refresh.widgetCalculation.status,
          widgetsRun: refresh.widgetCalculation.widgetsRun,
          widgetsSaved: refresh.widgetCalculation.widgetsSaved,
          errors: refresh.widgetCalculation.errors
        }
      : null
  });
}

function summarizeMacroRefresh(refresh: MacroRefreshResult | undefined) {
  if (!refresh) {
    return null;
  }

  return {
    status: refresh.status,
    collection: refresh.collection
      ? {
          status: refresh.collection.status,
          sourceRunId: refresh.collection.sourceRunId,
          candlesFetched: refresh.collection.candlesFetched,
          candlesInsertedOrUpdated: refresh.collection.candlesInsertedOrUpdated,
          errors: refresh.collection.errors
        }
      : null,
    widgetPersistence: refresh.widgetPersistence
      ? {
          status: refresh.widgetPersistence.status,
          widgetsRun: refresh.widgetPersistence.widgetsRun,
          widgetsSaved: refresh.widgetPersistence.widgetsSaved,
          warnings: refresh.widgetPersistence.warnings
        }
      : null
  };
}

function mergeCycleStatuses(
  cryptoStatus: SchedulerCycleResult["status"],
  macroStatus?: SchedulerCycleResult["status"]
): SchedulerCycleResult["status"] {
  if (cryptoStatus === "error" || macroStatus === "error") {
    return "error";
  }

  if (cryptoStatus === "partial" || macroStatus === "partial") {
    return "partial";
  }

  return cryptoStatus;
}

export function getSchedulerState(): SchedulerState {
  return {
    enabled: appConfig.schedulerEnabled,
    started: timer !== null,
    running,
    intervalSeconds: intervalSeconds(),
    lastRunAt,
    lastStatus,
    macroEnabled: appConfig.macroSchedulerEnabled,
    macroIntervalSeconds: macroIntervalSeconds(),
    lastMacroRunAt,
    lastMacroStatus
  };
}

export async function runSchedulerCycle(
  options: {
    reason?: string;
    db?: Database.Database;
    refresh?: () => Promise<CryptoRefreshResult>;
    macroRefresh?: () => Promise<MacroRefreshResult>;
  } = {}
): Promise<SchedulerCycleResult> {
  const reason = options.reason ?? "scheduled";
  const startedAt = new Date().toISOString();

  if (running) {
    const result: SchedulerCycleResult = {
      status: "skipped",
      startedAt,
      finishedAt: new Date().toISOString(),
      reason,
      message: "Previous scheduler cycle is still running"
    };
    lastStatus = result.status;
    return result;
  }

  running = true;
  lastRunAt = startedAt;

  if (!options.db) {
    initializeDatabase();
  }

  const db = options.db ?? getDatabase();
  const sourceRunId = insertSourceRun(db, {
    source: SCHEDULER_SOURCE,
    collectorId: SCHEDULER_COLLECTOR_ID,
    status: "running",
    startedAt,
    metadataJson: JSON.stringify({ reason })
  });

  try {
    const refresh = await (options.refresh ?? runCryptoRefresh)();
    const macroDue = isMacroDue(new Date(startedAt), db);
    const macroRefresh = macroDue
      ? await (options.macroRefresh ?? (() => runMacroRefresh({ db })))()
      : undefined;
    const finishedAt = new Date().toISOString();
    const status = mergeCycleStatuses(refresh.status, macroRefresh?.status);

    if (macroRefresh) {
      lastMacroRunAt = startedAt;
      lastMacroStatus = macroRefresh.status;
    }

    updateSourceRun(db, sourceRunId, {
      status: sourceRunStatus(status),
      finishedAt,
      errorMessage: status === "ok" ? null : "Scheduler refresh completed with errors",
      metadataJson: JSON.stringify({
        crypto: JSON.parse(summarizeRefresh(refresh)),
        macro: summarizeMacroRefresh(macroRefresh),
        macroDue,
        macroEnabled: appConfig.macroSchedulerEnabled
      })
    });

    lastStatus = status;

    return {
      status,
      startedAt,
      finishedAt,
      reason,
      sourceRunId,
      refresh,
      macroRefresh
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : "Unknown scheduler failure";

    updateSourceRun(db, sourceRunId, {
      status: "failure",
      finishedAt,
      errorMessage: message,
      metadataJson: JSON.stringify({ status: "error", reason, message })
    });

    lastStatus = "error";

    return {
      status: "error",
      startedAt,
      finishedAt,
      reason,
      sourceRunId,
      message
    };
  } finally {
    running = false;
  }
}

export function startScheduler() {
  initializeDatabase();

  if (!appConfig.schedulerEnabled) {
    return getSchedulerState();
  }

  if (timer) {
    return getSchedulerState();
  }

  timer = setInterval(() => {
    void runSchedulerCycle().catch((error) => {
      console.error("[scheduler] Scheduled cycle failed", error);
    });
  }, intervalSeconds() * 1000);

  timer.unref?.();

  return getSchedulerState();
}

export function stopSchedulerForTests() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }

  running = false;
  lastMacroRunAt = null;
  lastMacroStatus = null;
}
