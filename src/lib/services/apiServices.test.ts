import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { defaultSymbols } from "@/lib/config/symbols";
import { runMigrations } from "@/lib/db/migrations";
import { insertSourceRun } from "@/lib/db/repositories/sourceRunsRepository";
import { insertWidgetResult } from "@/lib/db/repositories/widgetResultsRepository";
import { seedSymbols } from "@/lib/db/repositories/symbolsRepository";
import { upsertCandles } from "@/lib/db/repositories/candlesRepository";
import { ApiInputError, validateSymbol, validateWidgetId } from "./apiValidation";
import { getMarketOverview } from "./marketDataService";
import { getRuntimeStatus } from "./runtimeStatusService";
import { listSymbols } from "./symbolService";
import { listLatestWidgetResults, listWidgetHistory } from "./widgetResultService";

function createMemoryDatabase() {
  const db = new Database(":memory:");
  runMigrations(db);
  seedSymbols(db, defaultSymbols);
  return db;
}

describe("API service layer", () => {
  it("lists active symbols without exposing database row internals", () => {
    const db = createMemoryDatabase();
    const symbols = listSymbols(db);

    assert.equal(symbols.length, 3);
    assert.deepEqual(Object.keys(symbols[0]).sort(), [
      "assetType",
      "baseAsset",
      "isActive",
      "quoteAsset",
      "source",
      "symbol"
    ]);
  });

  it("maps stored widget result JSON into API widget results", () => {
    const db = createMemoryDatabase();

    insertWidgetResult(db, {
      widgetId: "trend_strength",
      symbol: "SOLUSDT",
      timeframe: "1h",
      score: 72,
      direction: "bullish",
      confidence: 0.68,
      severity: "medium",
      summary: "Trend remains constructive.",
      detailsJson: JSON.stringify({ ma7VsMa30: "above", conflicts: [] }),
      sourcesJson: JSON.stringify([{ source: "binance", type: "ohlcv", symbol: "SOLUSDT", timeframe: "1h" }]),
      createdAt: "2026-05-22T10:00:00.000Z"
    });

    const latest = listLatestWidgetResults({ symbol: "SOLUSDT", timeframe: "1h" }, db);
    const history = listWidgetHistory({ symbol: "SOLUSDT", widgetId: "trend_strength", limit: 10 }, db);

    assert.equal(latest.length, 1);
    assert.equal(history.length, 1);
    assert.equal(latest[0].widgetId, "trend_strength");
    assert.deepEqual(latest[0].details, { ma7VsMa30: "above", conflicts: [] });
    assert.equal(latest[0].sources[0].source, "binance");
    assert.equal(latest[0].updatedAt, "2026-05-22T10:00:00.000Z");
  });

  it("rejects unsupported API query values", () => {
    assert.throws(() => validateSymbol("DOGEUSDT"), ApiInputError);
    assert.throws(() => validateWidgetId("unknown_widget"), ApiInputError);
  });

  it("returns normalized market overview from stored candles", () => {
    const db = createMemoryDatabase();

    upsertCandles(db, [
      {
        symbol: "BTCUSDT",
        timeframe: "1h",
        openTime: 1760000000000,
        closeTime: 1760003600000,
        open: 100,
        high: 105,
        low: 99,
        close: 104,
        volume: 10,
        source: "binance"
      },
      {
        symbol: "BTCUSDT",
        timeframe: "1h",
        openTime: 1760003600000,
        closeTime: 1760007200000,
        open: 104,
        high: 108,
        low: 103,
        close: 106,
        volume: 12,
        source: "binance"
      }
    ]);

    const overview = getMarketOverview({ symbol: "BTCUSDT", timeframe: "1h" }, db);

    assert.equal(overview.metrics.latestPrice, 106);
    assert.equal(overview.metrics.change, 2);
    assert.equal(overview.metrics.changePercent, 1.92);
    assert.equal(overview.metrics.periodVolume, 22);
    assert.equal(overview.candles.length, 2);
  });

  it("reports runtime collector failure without exposing raw metadata", () => {
    const db = createMemoryDatabase();

    insertSourceRun(db, {
      source: "binance",
      collectorId: "binance_ohlcv",
      status: "failure",
      startedAt: "2026-05-22T12:00:00.000Z",
      finishedAt: "2026-05-22T12:00:01.000Z",
      errorMessage: "Binance request failed",
      metadataJson: JSON.stringify({ raw: "internal debug details" })
    });

    const status = getRuntimeStatus(db);

    assert.equal(status.collection.hasCollectorFailure, true);
    assert.deepEqual(status.collection.warningMessages, ["Binance request failed"]);
    assert.equal(status.collection.latestBinanceRun?.status, "failure");
    assert.equal("metadataJson" in status.collection.latestBinanceRun!, false);
  });
});
