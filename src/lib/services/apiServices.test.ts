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
import { ApiInputError, validateOptionalRange, validateSymbol, validateSymbolAccess, validateWidgetId } from "./apiValidation";
import { getDashboardMarketOverview, getLiveMarketOverview, getMarketOverview, getStoredDashboardMarketOverview } from "./marketDataService";
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
    assert.throws(() => validateOptionalRange("3d"), ApiInputError);
    assert.throws(() => validateSymbolAccess("ETHUSDT", getSessionFromToken(undefined)), ApiInputError);
    assert.equal(validateOptionalRange("7D"), "7d");
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

  it("builds dashboard 1d and 7d ranges from live Binance candles instead of stored aggregate rows", async () => {
    const originalFetch = globalThis.fetch;
    const requestedUrls: string[] = [];

    globalThis.fetch = async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      requestedUrls.push(url.toString());
      const interval = url.searchParams.get("interval");
      const limit = Number(url.searchParams.get("limit"));
      const rows = Array.from({ length: limit }, (_, index) => {
        const open = interval === "1h" ? 100 + index : 200 + index;
        const close = open + 0.5;

        return [
          1710000000000 + index * 60_000,
          String(open),
          String(open + 2),
          String(open - 3),
          String(close),
          String(10 + index),
          1710000059999 + index * 60_000,
          "0",
          0,
          "0",
          "0",
          "0"
        ];
      });

      return new Response(JSON.stringify(rows), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    };

    try {
      const oneDay = await getLiveMarketOverview({ symbol: "BTCUSDT", timeframe: "1d", limit: 120 });
      const sevenDay = await getLiveMarketOverview({ symbol: "BTCUSDT", timeframe: "7d", limit: 120 });

      assert.equal(new URL(requestedUrls[0]).searchParams.get("interval"), "1h");
      assert.equal(new URL(requestedUrls[0]).searchParams.get("limit"), "24");
      assert.equal(oneDay.metrics.latestPrice, 123.5);
      assert.equal(oneDay.metrics.previousClose, 100);
      assert.equal(oneDay.metrics.change, 23.5);
      assert.equal(oneDay.metrics.changePercent, 23.5);
      assert.equal(oneDay.metrics.periodHigh, 125);
      assert.equal(oneDay.metrics.periodLow, 97);

      assert.equal(new URL(requestedUrls[1]).searchParams.get("interval"), "1d");
      assert.equal(new URL(requestedUrls[1]).searchParams.get("limit"), "7");
      assert.equal(sevenDay.metrics.latestPrice, 206.5);
      assert.equal(sevenDay.metrics.previousClose, 200);
      assert.equal(sevenDay.metrics.change, 6.5);
      assert.equal(sevenDay.metrics.changePercent, 3.25);
      assert.equal(sevenDay.metrics.periodHigh, 208);
      assert.equal(sevenDay.metrics.periodLow, 197);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps dashboard high and low tied to the exact returned chart range", async () => {
    const originalFetch = globalThis.fetch;
    const requestedUrls: string[] = [];

    globalThis.fetch = async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      requestedUrls.push(url.toString());
      const rows = Array.from({ length: 24 }, (_, index) => {
        const open = 70_000 + index * 10;
        const high = index === 4 ? 71_250 : open + 25;
        const low = index === 9 ? 69_850 : open - 20;
        const close = open + 5;

        return [
          1710000000000 + index * 3_600_000,
          String(open),
          String(high),
          String(low),
          String(close),
          "10",
          1710003599999 + index * 3_600_000,
          "0",
          0,
          "0",
          "0",
          "0"
        ];
      });

      return new Response(JSON.stringify(rows), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    };

    try {
      const overview = await getLiveMarketOverview({
        symbol: "BTCUSDT",
        timeframe: "1h",
        interval: "1h",
        range: "1d",
        limit: 120
      });

      assert.equal(new URL(requestedUrls[0]).searchParams.get("interval"), "1h");
      assert.equal(new URL(requestedUrls[0]).searchParams.get("limit"), "24");
      assert.equal(overview.range, "1d");
      assert.equal(overview.source.provider, "binance_live");
      assert.equal(overview.metrics.candleCount, overview.candles.length);
      assert.equal(overview.metrics.periodHigh, Math.max(...overview.candles.map((candle) => candle.high)));
      assert.equal(overview.metrics.periodLow, Math.min(...overview.candles.map((candle) => candle.low)));
      assert.equal(overview.metrics.periodHigh, 71_250);
      assert.equal(overview.metrics.periodLow, 69_850);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("marks dashboard overview as fallback when live candles are unavailable", async () => {
    const originalFetch = globalThis.fetch;
    const db = createMemoryDatabase();

    upsertCandles(
      db,
      Array.from({ length: 24 }, (_, index) => ({
        symbol: "BTCUSDT",
        timeframe: "1h",
        openTime: 1710000000000 + index * 3_600_000,
        closeTime: 1710003599999 + index * 3_600_000,
        open: 100 + index,
        high: 102 + index,
        low: 98 + index,
        close: 101 + index,
        volume: 10,
        source: "binance"
      }))
    );

    globalThis.fetch = async () =>
      new Response(JSON.stringify({ code: -1000, msg: "network unavailable" }), {
        status: 503,
        headers: { "content-type": "application/json" }
      });

    try {
      const liveFallback = await getDashboardMarketOverview({
        symbol: "BTCUSDT",
        timeframe: "1h",
        interval: "1h",
        range: "1d"
      }, db);

      const storedFallback = getStoredDashboardMarketOverview(
        {
          symbol: "BTCUSDT",
          timeframe: "1h",
          interval: "1h",
          range: "1d",
          fallbackReason: "Live Binance candles unavailable."
        },
        db
      );

      assert.equal(liveFallback.source.isFallback, true);
      assert.equal(liveFallback.source.provider, "sqlite");
      assert.match(liveFallback.source.warning ?? "", /Live Binance candles unavailable/);
      assert.equal(storedFallback.source.isFallback, true);
      assert.equal(storedFallback.metrics.candleCount, 24);
      assert.match(storedFallback.source.warning ?? "", /Live Binance candles unavailable/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("uses the same dashboard range definitions for stored fallback data", () => {
    const db = createMemoryDatabase();

    upsertCandles(db, [
      ...Array.from({ length: 24 }, (_, index) => ({
        symbol: "BTCUSDT",
        timeframe: "1h",
        openTime: 1710000000000 + index * 3_600_000,
        closeTime: 1710003599999 + index * 3_600_000,
        open: 100 + index,
        high: 102 + index,
        low: 98 + index,
        close: 101 + index,
        volume: 10,
        source: "binance"
      })),
      ...Array.from({ length: 7 }, (_, index) => ({
        symbol: "BTCUSDT",
        timeframe: "1d",
        openTime: 1711000000000 + index * 86_400_000,
        closeTime: 1711086399999 + index * 86_400_000,
        open: 200 + index,
        high: 203 + index,
        low: 197 + index,
        close: 201 + index,
        volume: 20,
        source: "binance"
      })),
      {
        symbol: "BTCUSDT",
        timeframe: "7d",
        openTime: 1700000000000,
        closeTime: 1700604799999,
        open: 1,
        high: 69_950,
        low: 66_925,
        close: 1,
        volume: 1,
        source: "binance"
      }
    ]);

    const oneDay = getStoredDashboardMarketOverview({ symbol: "BTCUSDT", timeframe: "1d" }, db);
    const sevenDay = getStoredDashboardMarketOverview({ symbol: "BTCUSDT", timeframe: "7d" }, db);

    assert.equal(oneDay.candles.length, 24);
    assert.equal(oneDay.metrics.previousClose, 100);
    assert.equal(oneDay.metrics.latestPrice, 124);
    assert.equal(sevenDay.candles.length, 7);
    assert.equal(sevenDay.metrics.previousClose, 200);
    assert.equal(sevenDay.metrics.latestPrice, 207);
    assert.equal(sevenDay.metrics.periodHigh, 209);
    assert.equal(sevenDay.metrics.periodLow, 197);
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
