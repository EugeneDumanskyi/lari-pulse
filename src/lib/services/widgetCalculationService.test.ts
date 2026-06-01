import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { runMigrations } from "@/lib/db/migrations";
import { upsertCandles } from "@/lib/db/repositories/candlesRepository";
import { insertLiquidationEvents } from "@/lib/db/repositories/liquidityRepository";
import { upsertDerivativesMetrics } from "@/lib/db/repositories/derivativesRepository";
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
      upsertDerivativesMetrics(db, [
        {
          symbol: "BTCUSDT",
          period: "1h",
          source: "binance_futures",
          metricTime: Date.parse("2026-05-22T11:00:00.000Z"),
          fundingRate: 0.0002,
          nextFundingTime: Date.parse("2026-05-22T16:00:00.000Z"),
          markPrice: 104050,
          indexPrice: 104000,
          openInterest: 10000,
          openInterestValue: 1040000000,
          longShortRatio: 1.2,
          longAccount: 0.55,
          shortAccount: 0.45,
          basis: 50,
          basisRate: 0.00048,
          annualizedBasisRate: 0.17,
          futuresPrice: 104050,
          metadataJson: null
        },
        {
          symbol: "BTCUSDT",
          period: "1h",
          source: "binance_futures",
          metricTime: Date.parse("2026-05-22T11:55:00.000Z"),
          fundingRate: null,
          nextFundingTime: null,
          markPrice: null,
          indexPrice: null,
          openInterest: 10800,
          openInterestValue: 1120000000,
          longShortRatio: null,
          longAccount: null,
          shortAccount: null,
          basis: null,
          basisRate: null,
          annualizedBasisRate: null,
          futuresPrice: null,
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
      assert.equal(result.widgetsRun, 7);
      assert.equal(result.widgetsSaved, 7);
      assert.deepEqual(result.errors, []);

      const latest = getLatestWidgetResults(db, {
        symbol: "BTCUSDT",
        timeframe: "1h"
      });

      assert.equal(latest.length, 7);
      assert.ok(latest.some((widget) => widget.widgetId === "liquidations"));
      assert.ok(latest.some((widget) => widget.widgetId === "derivatives_pressure"));
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
