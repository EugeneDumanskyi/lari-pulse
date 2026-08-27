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

function successfulMacroRefresh() {
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
      assert.equal(sourceRun?.collectorId, "market_scheduler");
      assert.equal(sourceRun?.status, "success");
      assert.match(sourceRun?.metadataJson ?? "", /"widgetsSaved":5/);
    } finally {
      stopSchedulerForTests();
      db.close();
    }
  });

  it("runs optional macro refresh when enabled and due", async () => {
    const db = createMemoryDatabase();
    const previousEnabled = appConfig.macroSchedulerEnabled;
    const previousInterval = appConfig.macroRefreshIntervalSeconds;

    appConfig.macroSchedulerEnabled = true;
    appConfig.macroRefreshIntervalSeconds = 60 * 60;

    try {
      const result = await runSchedulerCycle({
        db,
        reason: "macro-test",
        refresh: successfulRefresh,
        macroRefresh: successfulMacroRefresh
      });

      assert.equal(result.status, "ok");
      assert.equal(result.macroRefresh?.widgetPersistence?.widgetsSaved, 7);

      const sourceRun = getSourceRunById(db, result.sourceRunId!);

      assert.match(sourceRun?.metadataJson ?? "", /"macroDue":true/);
      assert.match(sourceRun?.metadataJson ?? "", /"widgetsSaved":7/);
    } finally {
      appConfig.macroSchedulerEnabled = previousEnabled;
      appConfig.macroRefreshIntervalSeconds = previousInterval;
      stopSchedulerForTests();
      db.close();
    }
  });

  it("uses persisted FRED success to avoid duplicate macro refresh after restart", async () => {
    const db = createMemoryDatabase();
    const previousEnabled = appConfig.macroSchedulerEnabled;
    const previousInterval = appConfig.macroRefreshIntervalSeconds;
    let macroRefreshCalls = 0;

    appConfig.macroSchedulerEnabled = true;
    appConfig.macroRefreshIntervalSeconds = 24 * 60 * 60;

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
        reason: "macro-persisted-due-check",
        refresh: successfulRefresh,
        macroRefresh: () => {
          macroRefreshCalls += 1;
          return successfulMacroRefresh();
        }
      });

      assert.equal(result.status, "ok");
      assert.equal(result.macroRefresh, undefined);
      assert.equal(macroRefreshCalls, 0);

      const sourceRun = getSourceRunById(db, result.sourceRunId!);

      assert.match(sourceRun?.metadataJson ?? "", /"macroDue":false/);
    } finally {
      appConfig.macroSchedulerEnabled = previousEnabled;
      appConfig.macroRefreshIntervalSeconds = previousInterval;
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
