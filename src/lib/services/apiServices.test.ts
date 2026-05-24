import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { defaultSymbols, phase2Symbols } from "@/lib/config/symbols";
import { runMigrations } from "@/lib/db/migrations";
import { insertSourceRun } from "@/lib/db/repositories/sourceRunsRepository";
import { insertWidgetResult } from "@/lib/db/repositories/widgetResultsRepository";
import { listActiveSymbols, seedSymbols } from "@/lib/db/repositories/symbolsRepository";
import { upsertCandles } from "@/lib/db/repositories/candlesRepository";
import { getSessionFromToken, createAdminSession } from "@/lib/auth/access";
import { ApiInputError, validateSymbol, validateSymbolAccess, validateWidgetId } from "./apiValidation";
import { getMarketOverview } from "./marketDataService";
import { getRuntimeStatus } from "./runtimeStatusService";
import { getMarkets } from "./marketCatalogService";
import { listSymbols } from "./symbolService";
import { listLatestWidgetResults, listWidgetHistory } from "./widgetResultService";
import { getEffectiveVisibleWidgetIds, updateWidgetSettings } from "./widgetSettingsService";

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
      "displayName",
      "isActive",
      "isLocked",
      "priceUnit",
      "providerSymbol",
      "quoteAsset",
      "source",
      "symbol"
    ]);
    assert.equal(symbols.find((symbol) => symbol.symbol === "BTCUSDT")?.isLocked, false);
    assert.equal(symbols.find((symbol) => symbol.symbol === "ETHUSDT")?.isLocked, true);

    const adminSymbols = listSymbols(db, createAdminSession());

    assert.equal(adminSymbols.every((symbol) => symbol.isLocked === false), true);
  });

  it("lists the broader market directory with locked state and source metadata", () => {
    const db = createMemoryDatabase();

    seedSymbols(db, phase2Symbols);
    upsertCandles(db, [
      {
        symbol: "US10Y",
        timeframe: "1d",
        openTime: 1760000000000,
        closeTime: 1760086400000,
        open: 4.1,
        high: 4.1,
        low: 4.1,
        close: 4.1,
        volume: 0,
        source: "fred"
      }
    ]);

    const basicMarkets = getMarkets(getSessionFromToken(undefined), db);
    const adminMarkets = getMarkets(createAdminSession(), db);

    assert.equal(basicMarkets.count, 10);
    assert.equal(basicMarkets.markets.find((market) => market.symbol === "BTCUSDT")?.isLocked, false);
    assert.equal(basicMarkets.markets.find((market) => market.symbol === "US10Y")?.isLocked, true);
    assert.equal(adminMarkets.markets.find((market) => market.symbol === "US10Y")?.isLocked, false);
    assert.equal(adminMarkets.markets.find((market) => market.symbol === "US10Y")?.latestValue, 4.1);
    assert.equal(adminMarkets.markets.find((market) => market.symbol === "US10Y")?.source, "fred");
  });

  it("seeds cross-market symbol metadata without changing the candle schema", () => {
    const db = createMemoryDatabase();

    seedSymbols(db, [
      {
        symbol: "VIX",
        assetType: "volatility",
        baseAsset: "VIX",
        quoteAsset: "POINTS",
        source: "stooq",
        displayName: "CBOE Volatility Index",
        providerSymbol: "^VIX",
        priceUnit: "index_points",
        metadata: { phase: "phase2" },
        isActive: true
      }
    ]);

    const vix = listActiveSymbols(db).find((symbol) => symbol.symbol === "VIX");

    assert.equal(vix?.assetType, "volatility");
    assert.equal(vix?.source, "stooq");
    assert.equal(vix?.providerSymbol, "^VIX");
    assert.equal(vix?.priceUnit, "index_points");
    assert.deepEqual(JSON.parse(vix?.metadataJson ?? "{}"), { phase: "phase2" });
  });

  it("migrates existing Phase 1 symbol tables for Phase 2 metadata columns", () => {
    const db = new Database(":memory:");

    db.exec(`
      CREATE TABLE symbols (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL UNIQUE,
        asset_type TEXT NOT NULL,
        base_asset TEXT NOT NULL,
        quote_asset TEXT NOT NULL,
        source TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    runMigrations(db);

    const columns = db.prepare("PRAGMA table_info(symbols)").all() as Array<{ name: string }>;
    const columnNames = columns.map((column) => column.name);

    assert.ok(columnNames.includes("display_name"));
    assert.ok(columnNames.includes("provider_symbol"));
    assert.ok(columnNames.includes("price_unit"));
    assert.ok(columnNames.includes("metadata_json"));
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

  it("applies saved admin widget visibility in catalog priority order", () => {
    const db = createMemoryDatabase();
    const session = createAdminSession();

    insertWidgetResult(db, {
      widgetId: "momentum_exhaustion",
      symbol: "BTCUSDT",
      timeframe: "1h",
      score: 48,
      direction: "neutral",
      confidence: 0.55,
      severity: "low",
      summary: "Momentum is balanced.",
      detailsJson: JSON.stringify({ rsi: 52 }),
      sourcesJson: JSON.stringify([{ source: "binance", type: "ohlcv", symbol: "BTCUSDT", timeframe: "1h" }]),
      createdAt: "2026-05-22T10:00:00.000Z"
    });
    insertWidgetResult(db, {
      widgetId: "trend_strength",
      symbol: "BTCUSDT",
      timeframe: "1h",
      score: 72,
      direction: "bullish",
      confidence: 0.68,
      severity: "medium",
      summary: "Trend remains constructive.",
      detailsJson: JSON.stringify({ ma7VsMa30: "above" }),
      sourcesJson: JSON.stringify([{ source: "binance", type: "ohlcv", symbol: "BTCUSDT", timeframe: "1h" }]),
      createdAt: "2026-05-22T10:01:00.000Z"
    });
    insertWidgetResult(db, {
      widgetId: "volume_confirmation",
      symbol: "BTCUSDT",
      timeframe: "1h",
      score: 31,
      direction: "bearish",
      confidence: 0.5,
      severity: "medium",
      summary: "Volume does not confirm.",
      detailsJson: JSON.stringify({ volumeTrend: "falling" }),
      sourcesJson: JSON.stringify([{ source: "binance", type: "ohlcv", symbol: "BTCUSDT", timeframe: "1h" }]),
      createdAt: "2026-05-22T10:02:00.000Z"
    });

    updateWidgetSettings({ enabledWidgetIds: ["momentum_exhaustion", "trend_strength"] }, session, db);

    const visible = new Set(getEffectiveVisibleWidgetIds(session, db));
    const latest = listLatestWidgetResults({ symbol: "BTCUSDT", timeframe: "1h" }, db).filter((widget) =>
      visible.has(widget.widgetId)
    );

    assert.deepEqual(
      latest.map((widget) => widget.widgetId),
      ["trend_strength", "momentum_exhaustion"]
    );
  });

  it("rejects unsupported API query values", () => {
    assert.throws(() => validateSymbol("DOGEUSDT"), ApiInputError);
    assert.throws(() => validateWidgetId("unknown_widget"), ApiInputError);
    assert.throws(() => validateSymbolAccess("ETHUSDT", getSessionFromToken(undefined)), ApiInputError);
    assert.equal(validateSymbolAccess("ETHUSDT", createAdminSession()), "ETHUSDT");
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
