import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { runMigrations } from "@/lib/db/migrations";
import { insertLiquidationEvents } from "@/lib/db/repositories/liquidityRepository";
import { listLatestWidgetResultsWithDerivedLiquidity } from "./widgetResultService";

function makeDb() {
  const db = new Database(":memory:");
  runMigrations(db);
  return db;
}

describe("widget result service derived liquidity results", () => {
  it("builds the Liquidations widget from stored events for derived toolbar timeframes", async () => {
    const db = makeDb();
    const now = Date.now();

    insertLiquidationEvents(db, [
      {
        eventId: "btc-long-7d",
        symbol: "BTCUSDT",
        source: "binance_futures",
        eventTime: now - 2 * 24 * 60 * 60 * 1000,
        side: "long_liquidated",
        orderSide: "SELL",
        price: 75_000,
        quantity: 1,
        notionalUsd: 75_000,
        metadataJson: null
      },
      {
        eventId: "btc-short-7d",
        symbol: "BTCUSDT",
        source: "binance_futures",
        eventTime: now - 3 * 24 * 60 * 60 * 1000,
        side: "short_liquidated",
        orderSide: "BUY",
        price: 80_000,
        quantity: 2,
        notionalUsd: 160_000,
        metadataJson: null
      },
      {
        eventId: "btc-old",
        symbol: "BTCUSDT",
        source: "binance_futures",
        eventTime: now - 8 * 24 * 60 * 60 * 1000,
        side: "short_liquidated",
        orderSide: "BUY",
        price: 70_000,
        quantity: 10,
        notionalUsd: 700_000,
        metadataJson: null
      }
    ]);

    const results = await listLatestWidgetResultsWithDerivedLiquidity(
      {
        symbol: "BTCUSDT",
        timeframe: "7d"
      },
      db
    );
    const liquidations = results.find((result) => result.widgetId === "liquidations");

    assert.equal(liquidations?.timeframe, "7d");
    assert.equal(liquidations?.details.totalLiquidatedUsd, 235_000);
    assert.equal(liquidations?.details.longLiquidatedUsd, 75_000);
    assert.equal(liquidations?.details.shortLiquidatedUsd, 160_000);
    assert.equal(liquidations?.details.eventCount, 2);
  });
});
