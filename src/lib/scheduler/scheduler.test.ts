import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { appConfig } from "@/lib/config/appConfig";
import { runMigrations } from "@/lib/db/migrations";
import { getSourceRunById, insertSourceRun } from "@/lib/db/repositories/sourceRunsRepository";
import { runSchedulerCycle, stopSchedulerForTests } from "./scheduler";

function createMemoryDatabase() {
  const db = new Database(":memory:");
  runMigrations(db);
  return db;
}

function successfulRefresh() {
  return Promise.resolve({
    status: "ok" as const,
    collection: {
      status: "ok" as const,
      sourceRunId: 42,
      symbolsProcessed: 1,
      timeframesProcessed: 1,
      candlesFetched: 100,
      candlesInsertedOrUpdated: 100,
      startedAt: "2026-05-22T12:00:00.000Z",
      finishedAt: "2026-05-22T12:00:01.000Z",
      errors: []
    },
    widgetCalculation: {
      status: "ok" as const,
      symbolsProcessed: 1,
      timeframesProcessed: 1,
      widgetsRun: 5,
      widgetsSaved: 5,
      startedAt: "2026-05-22T12:00:01.000Z",
      finishedAt: "2026-05-22T12:00:02.000Z",
      errors: []
    }
  });
}

function successfulPhase2Refresh() {
  return Promise.resolve({
    status: "ok" as const,
    collection: {
      status: "ok" as const,
      sourceRunId: 77,
      symbolsProcessed: 7,
      timeframesProcessed: 1,
      candlesFetched: 700,
      candlesInsertedOrUpdated: 700,
      startedAt: "2026-05-22T12:00:00.000Z",
      finishedAt: "2026-05-22T12:00:01.000Z",
      errors: []
    },
    widgetPersistence: {
      status: "ok" as const,
      widgetsRun: 7,
      widgetsSaved: 7,
      warnings: [],
      updatedAt: "2026-05-22T12:00:02.000Z"
    }
  });
}

describe("scheduler", () => {
  it("logs a successful scheduled cycle", async () => {
    const db = createMemoryDatabase();

    try {
      const result = await runSchedulerCycle({
        db,
        reason: "test",
        refresh: successfulRefresh
      });

      assert.equal(result.status, "ok");
      assert.ok(result.sourceRunId);

      const sourceRun = getSourceRunById(db, result.sourceRunId);

      assert.equal(sourceRun?.source, "internal");
      assert.equal(sourceRun?.collectorId, "phase1_scheduler");
      assert.equal(sourceRun?.status, "success");
      assert.match(sourceRun?.metadataJson ?? "", /"widgetsSaved":5/);
    } finally {
      stopSchedulerForTests();
      db.close();
    }
  });

  it("runs optional Phase 2 refresh when enabled and due", async () => {
    const db = createMemoryDatabase();
    const previousEnabled = appConfig.phase2SchedulerEnabled;
    const previousInterval = appConfig.phase2RefreshIntervalSeconds;

    appConfig.phase2SchedulerEnabled = true;
    appConfig.phase2RefreshIntervalSeconds = 60 * 60;

    try {
      const result = await runSchedulerCycle({
        db,
        reason: "phase2-test",
        refresh: successfulRefresh,
        phase2Refresh: successfulPhase2Refresh
      });

      assert.equal(result.status, "ok");
      assert.equal(result.phase2Refresh?.widgetPersistence?.widgetsSaved, 7);

      const sourceRun = getSourceRunById(db, result.sourceRunId!);

      assert.match(sourceRun?.metadataJson ?? "", /"phase2Due":true/);
      assert.match(sourceRun?.metadataJson ?? "", /"widgetsSaved":7/);
    } finally {
      appConfig.phase2SchedulerEnabled = previousEnabled;
      appConfig.phase2RefreshIntervalSeconds = previousInterval;
      stopSchedulerForTests();
      db.close();
    }
  });

  it("uses persisted FRED success to avoid duplicate Phase 2 refresh after restart", async () => {
    const db = createMemoryDatabase();
    const previousEnabled = appConfig.phase2SchedulerEnabled;
    const previousInterval = appConfig.phase2RefreshIntervalSeconds;
    let phase2RefreshCalls = 0;

    appConfig.phase2SchedulerEnabled = true;
    appConfig.phase2RefreshIntervalSeconds = 24 * 60 * 60;

    insertSourceRun(db, {
      source: "fred",
      collectorId: "fred_daily_series",
      status: "success",
      startedAt: new Date(Date.now() - 60_000).toISOString(),
      finishedAt: new Date().toISOString(),
      metadataJson: JSON.stringify({ status: "ok" })
    });

    try {
      const result = await runSchedulerCycle({
        db,
        reason: "phase2-persisted-due-check",
        refresh: successfulRefresh,
        phase2Refresh: () => {
          phase2RefreshCalls += 1;
          return successfulPhase2Refresh();
        }
      });

      assert.equal(result.status, "ok");
      assert.equal(result.phase2Refresh, undefined);
      assert.equal(phase2RefreshCalls, 0);

      const sourceRun = getSourceRunById(db, result.sourceRunId!);

      assert.match(sourceRun?.metadataJson ?? "", /"phase2Due":false/);
    } finally {
      appConfig.phase2SchedulerEnabled = previousEnabled;
      appConfig.phase2RefreshIntervalSeconds = previousInterval;
      stopSchedulerForTests();
      db.close();
    }
  });

  it("skips overlapping cycles", async () => {
    const db = createMemoryDatabase();
    let releaseRefresh!: () => void;
    let firstCycle!: Promise<unknown>;
    const refreshStarted = new Promise<void>((resolve) => {
      const refresh = () =>
        new Promise<Awaited<ReturnType<typeof successfulRefresh>>>((release) => {
          releaseRefresh = () => release(successfulRefresh());
          resolve();
        });

      firstCycle = runSchedulerCycle({ db, reason: "slow-test", refresh });
    });

    try {
      await refreshStarted;

      const skipped = await runSchedulerCycle({
        db,
        reason: "overlap-test",
        refresh: successfulRefresh
      });

      assert.equal(skipped.status, "skipped");
      assert.equal(skipped.message, "Previous scheduler cycle is still running");

      releaseRefresh();
      await firstCycle;
    } finally {
      stopSchedulerForTests();
      db.close();
    }
  });
});
