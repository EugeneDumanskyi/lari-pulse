import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { defaultSymbols, crossMarketSymbols } from "@/lib/config/symbols";
import { runMigrations } from "@/lib/db/migrations";
import { upsertCandles } from "@/lib/db/repositories/candlesRepository";
import { getLatestWidgetResults } from "@/lib/db/repositories/widgetResultsRepository";
import type { NewCandle } from "@/lib/db/types";
import { getCrossMarketWidgets } from "./crossMarketWidgetService";

function createMemoryDatabase() {
  const db = new Database(":memory:");
  runMigrations(db);
  return db;
}

function makeDailyCandles(symbol: string, source: string, count = 45, start = 100): NewCandle[] {
  return Array.from({ length: count }, (_, index) => {
    const openTime = Date.UTC(2026, 3, 1 + index, 0, 0, 0);
    const close = start + index * 0.8 + Math.sin(index / 4);
    const open = close - 0.25;

    return {
      symbol,
      timeframe: "1d",
      openTime,
      closeTime: openTime + 86_399_999,
      open,
      high: close + 1,
      low: open - 1,
      close,
      volume: source === "binance" ? 1000 + index * 20 : 0,
      source
    };
  });
}

describe("cross-market widget service", () => {
  it("runs cross-market widgets from stored daily candles without persisting results", async () => {
    const db = createMemoryDatabase();

    try {
      for (const config of defaultSymbols) {
        upsertCandles(db, makeDailyCandles(config.symbol, config.source, 45, 100));
      }

      for (const config of crossMarketSymbols) {
        upsertCandles(db, makeDailyCandles(config.symbol, config.source, 45, 80));
      }

      const result = await getCrossMarketWidgets({
        db,
        now: new Date("2026-05-18T12:00:00.000Z")
      });

      assert.equal(result.timeframe, "1d");
      assert.equal(result.results.length, 7);
      assert.equal(result.assetStatuses.length, 10);
      assert.equal(result.correlations.length, 8);
      assert.equal(result.warnings.length, 0);
      assert.ok(result.results.every((widget) => widget.symbol === "CROSS_MARKET"));
      assert.ok(result.results.some((widget) => widget.widgetId === "macro_risk_pulse"));
      assert.ok(result.results.some((widget) => widget.widgetId === "risk_regime"));
    } finally {
      db.close();
    }
  });

  it("surfaces missing asset warnings while still returning widget results", async () => {
    const db = createMemoryDatabase();

    try {
      upsertCandles(db, makeDailyCandles("BTCUSDT", "binance"));

      const result = await getCrossMarketWidgets({
        db,
        now: new Date("2026-05-22T12:00:00.000Z")
      });

      assert.equal(result.results.length, 7);
      assert.ok(result.warnings.some((warning) => warning.includes("NASDAQ100")));
      assert.ok(result.assetStatuses.find((status) => status.symbol === "DXY")?.isMissing);
    } finally {
      db.close();
    }
  });

  it("can persist cross-market widget results for scheduler refreshes", async () => {
    const db = createMemoryDatabase();

    try {
      for (const config of defaultSymbols) {
        upsertCandles(db, makeDailyCandles(config.symbol, config.source, 45, 100));
      }

      for (const config of crossMarketSymbols) {
        upsertCandles(db, makeDailyCandles(config.symbol, config.source, 45, 80));
      }

      const result = await getCrossMarketWidgets({
        db,
        saveResults: true,
        now: new Date("2026-05-18T12:00:00.000Z")
      });
      const latest = getLatestWidgetResults(db, {
        symbol: "CROSS_MARKET",
        timeframe: "1d"
      });

      assert.equal(result.results.length, 7);
      assert.equal(result.results.filter((widget) => widget.id > 0).length, 7);
      assert.equal(latest.length, 7);
      assert.ok(latest.some((widget) => widget.widgetId === "cross_market_divergence"));
    } finally {
      db.close();
    }
  });

  it("surfaces stale asset warnings while preserving widget output", async () => {
    const db = createMemoryDatabase();

    try {
      for (const config of defaultSymbols) {
        upsertCandles(db, makeDailyCandles(config.symbol, config.source, 45, 100));
      }

      for (const config of crossMarketSymbols) {
        upsertCandles(db, makeDailyCandles(config.symbol, config.source, 45, 80));
      }

      const result = await getCrossMarketWidgets({
        db,
        now: new Date("2026-05-26T12:00:00.000Z")
      });

      assert.equal(result.results.length, 7);
      assert.ok(result.warnings.some((warning) => warning.includes("BTCUSDT 1d data is stale")));
      assert.equal(result.assetStatuses.find((status) => status.symbol === "BTCUSDT")?.isStale, true);
    } finally {
      db.close();
    }
  });
});
