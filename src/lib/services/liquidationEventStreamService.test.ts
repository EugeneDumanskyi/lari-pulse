import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { runMigrations } from "@/lib/db/migrations";
import { insertLiquidationEvents } from "@/lib/db/repositories/liquidityRepository";
import { getLatestSourceRuns, insertSourceRun } from "@/lib/db/repositories/sourceRunsRepository";
import type { LiquidationWebSocket } from "@/lib/collectors/binanceLiquidationStreamCollector";
import {
  getLiquidationIntervalSummary,
  startBinanceLiquidationEventStream,
  stopBinanceLiquidationEventStream
} from "./liquidationEventStreamService";

class FakeWebSocket implements LiquidationWebSocket {
  close() {}
  addEventListener() {}
}

function makeDb() {
  const db = new Database(":memory:");
  runMigrations(db);
  return db;
}

describe("liquidation event stream service", () => {
  it("aggregates observed liquidations by dashboard timeframe", () => {
    const db = makeDb();
    const now = new Date("2026-05-26T12:00:00.000Z");

    insertLiquidationEvents(db, [
      {
        eventId: "long-recent",
        symbol: "BTCUSDT",
        source: "binance_futures",
        eventTime: now.getTime() - 5 * 60 * 1000,
        side: "long_liquidated",
        orderSide: "SELL",
        price: 100000,
        quantity: 0.5,
        notionalUsd: 50000,
        metadataJson: null
      },
      {
        eventId: "short-recent",
        symbol: "BTCUSDT",
        source: "binance_futures",
        eventTime: now.getTime() - 10 * 60 * 1000,
        side: "short_liquidated",
        orderSide: "BUY",
        price: 100000,
        quantity: 0.2,
        notionalUsd: 20000,
        metadataJson: null
      },
      {
        eventId: "old",
        symbol: "BTCUSDT",
        source: "binance_futures",
        eventTime: now.getTime() - 2 * 60 * 60 * 1000,
        side: "short_liquidated",
        orderSide: "BUY",
        price: 100000,
        quantity: 10,
        notionalUsd: 1000000,
        metadataJson: null
      }
    ]);

    const summary = getLiquidationIntervalSummary(
      {
        symbol: "BTCUSDT",
        timeframe: "1h",
        now
      },
      db
    );

    assert.equal(summary.longCount, 1);
    assert.equal(summary.shortCount, 1);
    assert.equal(summary.totalNotionalUsd, 70000);
    assert.equal(summary.totalLiquidatedUsd, 70000);
    assert.equal(summary.longLiquidatedUsd, 50000);
    assert.equal(summary.shortLiquidatedUsd, 20000);
    assert.equal(summary.eventCount, 2);
    assert.equal(summary.largestLiquidation?.side, "long_liquidated");
    assert.equal(summary.timeline.length, 12);
    assert.equal(summary.netPressure, "long_liquidations");
  });

  it("logs stream source run lifecycle", () => {
    const db = makeDb();
    const staleRunId = insertSourceRun(db, {
      source: "binance_futures",
      collectorId: "binance_liquidation_stream",
      status: "running",
      startedAt: "2026-05-26T00:00:00.000Z"
    });

    const started = startBinanceLiquidationEventStream({
      db,
      symbols: ["BTCUSDT"],
      websocketFactory: () => new FakeWebSocket(),
      logger: { warn() {}, error() {} }
    });

    assert.equal(started.started, true);
    assert.equal(started.sourceRunId !== null, true);

    const runningRun = getLatestSourceRuns(db, {
      source: "binance_futures",
      collectorId: "binance_liquidation_stream",
      limit: 2
    });

    assert.equal(runningRun.at(0)?.status, "running");
    assert.equal(runningRun.at(1)?.id, staleRunId);
    assert.equal(runningRun.at(1)?.status, "failure");
    assert.match(runningRun.at(1)?.errorMessage ?? "", /superseded/);

    const stopped = stopBinanceLiquidationEventStream(db);
    assert.equal(stopped.started, false);

    const finishedRun = getLatestSourceRuns(db, {
      source: "binance_futures",
      collectorId: "binance_liquidation_stream",
      limit: 1
    }).at(0);

    assert.equal(finishedRun?.status, "success");
    assert.equal(finishedRun?.finishedAt !== null, true);
  });
});
