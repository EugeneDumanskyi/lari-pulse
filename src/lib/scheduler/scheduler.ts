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
import { runPhase1Refresh, type Phase1RefreshResult } from "@/lib/services/phase1RefreshService";
import { runPhase2Refresh, type Phase2RefreshResult } from "@/lib/services/phase2RefreshService";

export interface SchedulerCycleResult {
  status: "ok" | "partial" | "error" | "skipped";
  startedAt: string;
  finishedAt: string;
  reason: string;
  sourceRunId?: number;
  refresh?: Phase1RefreshResult;
  phase2Refresh?: Phase2RefreshResult;
  message?: string;
}

export interface SchedulerState {
  enabled: boolean;
  started: boolean;
  running: boolean;
  intervalSeconds: number;
  lastRunAt: string | null;
  lastStatus: SchedulerCycleResult["status"] | null;
  phase2Enabled: boolean;
  phase2IntervalSeconds: number;
  lastPhase2RunAt: string | null;
  lastPhase2Status: SchedulerCycleResult["status"] | null;
}

type TimerHandle = ReturnType<typeof setInterval>;

const SCHEDULER_SOURCE = "internal";
const SCHEDULER_COLLECTOR_ID = "phase1_scheduler";

let timer: TimerHandle | null = null;
let running = false;
let lastRunAt: string | null = null;
let lastStatus: SchedulerCycleResult["status"] | null = null;
let lastPhase2RunAt: string | null = null;
let lastPhase2Status: SchedulerCycleResult["status"] | null = null;

function intervalSeconds() {
  const value = appConfig.collectIntervalSeconds;

  if (!Number.isFinite(value) || value < 10) {
    return 60;
  }

  return Math.floor(value);
}

function phase2IntervalSeconds() {
  const value = appConfig.phase2RefreshIntervalSeconds;

  if (!Number.isFinite(value) || value < 60 * 60) {
    return 24 * 60 * 60;
  }

  return Math.floor(value);
}

function latestPersistedPhase2RunAt(db: Database.Database) {
  const latestFredSuccess = getLatestSourceRuns(db, {
    source: "fred",
    collectorId: "fred_daily_series",
    limit: 8
  }).find((run) => run.status === "success" && run.finishedAt);

  return latestFredSuccess?.finishedAt ?? null;
}

function isPhase2Due(now: Date, db: Database.Database) {
  if (!appConfig.phase2SchedulerEnabled) {
    return false;
  }

  const latestRunAt = lastPhase2RunAt ?? latestPersistedPhase2RunAt(db);

  if (!latestRunAt) {
    return true;
  }

  return now.getTime() - new Date(latestRunAt).getTime() >= phase2IntervalSeconds() * 1000;
}

function sourceRunStatus(status: SchedulerCycleResult["status"]): SourceRunStatus {
  return status === "ok" ? "success" : "failure";
}

function summarizeRefresh(refresh: Phase1RefreshResult) {
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

function summarizePhase2Refresh(refresh: Phase2RefreshResult | undefined) {
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
  phase1Status: SchedulerCycleResult["status"],
  phase2Status?: SchedulerCycleResult["status"]
): SchedulerCycleResult["status"] {
  if (phase1Status === "error" || phase2Status === "error") {
    return "error";
  }

  if (phase1Status === "partial" || phase2Status === "partial") {
    return "partial";
  }

  return phase1Status;
}

export function getSchedulerState(): SchedulerState {
  return {
    enabled: appConfig.schedulerEnabled,
    started: timer !== null,
    running,
    intervalSeconds: intervalSeconds(),
    lastRunAt,
    lastStatus,
    phase2Enabled: appConfig.phase2SchedulerEnabled,
    phase2IntervalSeconds: phase2IntervalSeconds(),
    lastPhase2RunAt,
    lastPhase2Status
  };
}

export async function runSchedulerCycle(
  options: {
    reason?: string;
    db?: Database.Database;
    refresh?: () => Promise<Phase1RefreshResult>;
    phase2Refresh?: () => Promise<Phase2RefreshResult>;
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
    const refresh = await (options.refresh ?? runPhase1Refresh)();
    const phase2Due = isPhase2Due(new Date(startedAt), db);
    const phase2Refresh = phase2Due
      ? await (options.phase2Refresh ?? (() => runPhase2Refresh({ db })))()
      : undefined;
    const finishedAt = new Date().toISOString();
    const status = mergeCycleStatuses(refresh.status, phase2Refresh?.status);

    if (phase2Refresh) {
      lastPhase2RunAt = startedAt;
      lastPhase2Status = phase2Refresh.status;
    }

    updateSourceRun(db, sourceRunId, {
      status: sourceRunStatus(status),
      finishedAt,
      errorMessage: status === "ok" ? null : "Scheduler refresh completed with errors",
      metadataJson: JSON.stringify({
        phase1: JSON.parse(summarizeRefresh(refresh)),
        phase2: summarizePhase2Refresh(phase2Refresh),
        phase2Due,
        phase2Enabled: appConfig.phase2SchedulerEnabled
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
      phase2Refresh
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
  lastPhase2RunAt = null;
  lastPhase2Status = null;
}
