import type Database from "better-sqlite3";
import { appConfig } from "@/lib/config/appConfig";
import { getDatabase } from "@/lib/db/client";
import { initializeDatabase } from "@/lib/db/initialize";
import {
  insertSourceRun,
  updateSourceRun
} from "@/lib/db/repositories/sourceRunsRepository";
import type { SourceRunStatus } from "@/lib/db/types";
import { runPhase1Refresh, type Phase1RefreshResult } from "@/lib/services/phase1RefreshService";

export interface SchedulerCycleResult {
  status: "ok" | "partial" | "error" | "skipped";
  startedAt: string;
  finishedAt: string;
  reason: string;
  sourceRunId?: number;
  refresh?: Phase1RefreshResult;
  message?: string;
}

export interface SchedulerState {
  enabled: boolean;
  started: boolean;
  running: boolean;
  intervalSeconds: number;
  lastRunAt: string | null;
  lastStatus: SchedulerCycleResult["status"] | null;
}

type TimerHandle = ReturnType<typeof setInterval>;

const SCHEDULER_SOURCE = "internal";
const SCHEDULER_COLLECTOR_ID = "phase1_scheduler";

let timer: TimerHandle | null = null;
let running = false;
let lastRunAt: string | null = null;
let lastStatus: SchedulerCycleResult["status"] | null = null;

function intervalSeconds() {
  const value = appConfig.collectIntervalSeconds;

  if (!Number.isFinite(value) || value < 10) {
    return 60;
  }

  return Math.floor(value);
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

export function getSchedulerState(): SchedulerState {
  return {
    enabled: appConfig.schedulerEnabled,
    started: timer !== null,
    running,
    intervalSeconds: intervalSeconds(),
    lastRunAt,
    lastStatus
  };
}

export async function runSchedulerCycle(
  options: {
    reason?: string;
    db?: Database.Database;
    refresh?: () => Promise<Phase1RefreshResult>;
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
    const finishedAt = new Date().toISOString();
    const status = refresh.status;

    updateSourceRun(db, sourceRunId, {
      status: sourceRunStatus(status),
      finishedAt,
      errorMessage: status === "ok" ? null : "Scheduler refresh completed with errors",
      metadataJson: summarizeRefresh(refresh)
    });

    lastStatus = status;

    return {
      status,
      startedAt,
      finishedAt,
      reason,
      sourceRunId,
      refresh
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
}
