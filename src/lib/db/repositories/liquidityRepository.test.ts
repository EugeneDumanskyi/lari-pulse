import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { runMigrations } from "@/lib/db/migrations";
import {
  aggregateLiquidationEvents,
  deleteOldLiquidationEvents,
  getLiquidationEvents,
  insertLiquidationEvents
} from "./liquidityRepository";

function createMemoryDatabase() {
  const db = new Database(":memory:");
  runMigrations(db);
  return db;
}

describe("liquidity repository", () => {
  it("deduplicates, aggregates, and prunes liquidation events", () => {
    const db = createMemoryDatabase();

    const inserted = insertLiquidationEvents(db, [
      {
        eventId: "binance:BTCUSDT:1000:long:100000:0.4",
        symbol: "BTCUSDT",
        source: "binance_futures",
        eventTime: 1000,
        side: "long_liquidated",
        orderSide: "SELL",
        price: 100000,
        quantity: 0.4,
        notionalUsd: 40000,
        metadataJson: null
      },
      {
        eventId: "binance:BTCUSDT:2000:short:101000:0.2",
        symbol: "BTCUSDT",
        source: "binance_futures",
        eventTime: 2000,
        side: "short_liquidated",
        orderSide: "BUY",
        price: 101000,
        quantity: 0.2,
        notionalUsd: 20200,
        metadataJson: JSON.stringify({ stream: "!forceOrder@arr" })
      },
      {
        eventId: "binance:BTCUSDT:2000:short:101000:0.2",
        symbol: "BTCUSDT",
        source: "binance_futures",
        eventTime: 2000,
        side: "short_liquidated",
        orderSide: "BUY",
        price: 101000,
        quantity: 0.2,
        notionalUsd: 20200,
        metadataJson: null
      },
      {
        eventId: "binance:ETHUSDT:2500:short:4000:30",
        symbol: "ETHUSDT",
        source: "binance_futures",
        eventTime: 2500,
        side: "short_liquidated",
        orderSide: "BUY",
        price: 4000,
        quantity: 30,
        notionalUsd: 120000,
        metadataJson: null
      }
    ]);

    assert.equal(inserted, 3);

    const aggregate = aggregateLiquidationEvents(db, {
      symbol: "BTCUSDT",
      fromTime: 0,
      toTime: 3000,
      source: "binance_futures",
      bucketSizeMs: 1000
    });

    assert.equal(aggregate.longCount, 1);
    assert.equal(aggregate.shortCount, 1);
    assert.equal(aggregate.longNotionalUsd, 40000);
    assert.equal(aggregate.shortNotionalUsd, 20200);
    assert.equal(aggregate.totalLiquidatedUsd, 60200);
    assert.equal(aggregate.longLiquidatedUsd, 40000);
    assert.equal(aggregate.shortLiquidatedUsd, 20200);
    assert.equal(aggregate.eventCount, 2);
    assert.equal(Math.round(aggregate.longShortImbalance * 1000) / 1000, 0.329);
    assert.equal(aggregate.largestLiquidation?.side, "long_liquidated");
    assert.equal(aggregate.largestLiquidation?.notionalUsd, 40000);
    assert.deepEqual(aggregate.topSymbolsByLiquidation.at(0), {
      symbol: "ETHUSDT",
      totalLiquidatedUsd: 120000,
      longLiquidatedUsd: 0,
      shortLiquidatedUsd: 120000,
      eventCount: 1
    });
    assert.deepEqual(aggregate.topSymbolsByLiquidation.at(1), {
      symbol: "BTCUSDT",
      totalLiquidatedUsd: 60200,
      longLiquidatedUsd: 40000,
      shortLiquidatedUsd: 20200,
      eventCount: 2
    });
    assert.equal(aggregate.timeline.length, 3);
    assert.equal(aggregate.timeline[1].longLiquidatedUsd, 40000);
    assert.equal(aggregate.timeline[2].shortLiquidatedUsd, 20200);

    const events = getLiquidationEvents(db, {
      symbol: "BTCUSDT",
      fromTime: 0,
      toTime: 3000
    });

    assert.equal(events.length, 2);
    assert.equal(events[0].side, "short_liquidated");
    assert.equal(deleteOldLiquidationEvents(db, 1500), 1);
    assert.equal(getLiquidationEvents(db, { symbol: "BTCUSDT", fromTime: 0, toTime: 3000 }).length, 1);
  });
});
