import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { runMigrations } from "@/lib/db/migrations";
import { insertLiquidationEvents } from "@/lib/db/repositories/liquidityRepository";
import {
  getLiquidityRuntimeState,
  runLiquidityRetentionCleanup,
  stopLiquidityRuntimeForTests
} from "./liquidityRuntimeService";

function makeDb() {
  const db = new Database(":memory:");
  runMigrations(db);
  return db;
}

describe("liquidity runtime service", () => {
  it("can run liquidation retention cleanup independently", () => {
    const db = makeDb();

    insertLiquidationEvents(db, [
      {
        eventId: "stale-event",
        symbol: "BTCUSDT",
        source: "binance_futures",
        eventTime: Date.now() - 91 * 24 * 60 * 60 * 1000,
        side: "short_liquidated",
        orderSide: "BUY",
        price: 100000,
        quantity: 0.2,
        notionalUsd: 20000,
        metadataJson: null
      }
    ]);

    try {
      assert.equal(runLiquidityRetentionCleanup(db), 1);
      assert.equal(getLiquidityRuntimeState().lastRetentionPrunedEvents, 1);
    } finally {
      stopLiquidityRuntimeForTests(db);
      db.close();
    }
  });
});
