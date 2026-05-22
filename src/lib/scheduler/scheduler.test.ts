import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { runMigrations } from "@/lib/db/migrations";
import { getSourceRunById } from "@/lib/db/repositories/sourceRunsRepository";
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
