import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { runMigrations } from "@/lib/db/migrations";
import { upsertCandles } from "@/lib/db/repositories/candlesRepository";
import { insertLiquidationEvents } from "@/lib/db/repositories/liquidityRepository";
import { getLatestWidgetResults } from "@/lib/db/repositories/widgetResultsRepository";
import type { NewCandle } from "@/lib/db/types";
import { runWidgetCalculations } from "./widgetCalculationService";

function createMemoryDatabase() {
  const db = new Database(":memory:");
  runMigrations(db);
  return db;
}

function makeCandles(symbol: string, timeframe: string, count = 90, start = 100): NewCandle[] {
  return Array.from({ length: count }, (_, index) => {
    const openTime = Date.UTC(2026, 4, 20, 0, 0, 0) + index * 60_000;
    const close = start + index * 0.7 + Math.sin(index / 3);
    const open = close - 0.35;

    return {
      symbol,
      timeframe,
      openTime,
      closeTime: openTime + 59_999,
      open,
      high: close + 1.1,
      low: open - 1.1,
      close,
      volume: 1000 + index * 8,
      source: "binance"
    };
  });
}

describe("widget calculation service", () => {
  it("runs all phase 1 widgets from stored candles and saves results", async () => {
    const db = createMemoryDatabase();

    try {
      for (const timeframe of ["15m", "1h", "4h", "1d"]) {
        upsertCandles(db, makeCandles("BTCUSDT", timeframe));
      }
      insertLiquidationEvents(db, [
        {
          eventId: "liq-1",
          symbol: "BTCUSDT",
          source: "binance",
          eventTime: Date.parse("2026-05-22T11:45:00.000Z"),
          side: "short_liquidated",
          orderSide: "BUY",
          price: 104100,
          quantity: 2,
          notionalUsd: 208200,
          metadataJson: null
        }
      ]);

      const result = await runWidgetCalculations({
        db,
        symbols: ["BTCUSDT"],
        timeframes: ["1h"],
        now: new Date("2026-05-22T12:00:00.000Z")
      });

      assert.equal(result.status, "ok");
      assert.equal(result.widgetsRun, 6);
      assert.equal(result.widgetsSaved, 6);
      assert.deepEqual(result.errors, []);

      const latest = getLatestWidgetResults(db, {
        symbol: "BTCUSDT",
        timeframe: "1h"
      });

      assert.equal(latest.length, 6);
      assert.ok(latest.some((widget) => widget.widgetId === "liquidations"));
    } finally {
      db.close();
    }
  });

  it("reports missing candle data without saving widget results", async () => {
    const db = createMemoryDatabase();

    try {
      const result = await runWidgetCalculations({
        db,
        symbols: ["ETHUSDT"],
        timeframes: ["1h"],
        now: new Date("2026-05-22T12:00:00.000Z")
      });

      assert.equal(result.status, "error");
      assert.equal(result.widgetsRun, 0);
      assert.equal(result.widgetsSaved, 0);
      assert.equal(result.errors[0].message, "No stored candles available for widget calculation");
    } finally {
      db.close();
    }
  });
});
