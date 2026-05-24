import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import Database from "better-sqlite3";
import { phase2Symbols } from "@/lib/config/symbols";
import { runMigrations } from "@/lib/db/migrations";
import { getCandlesBySymbolTimeframe } from "@/lib/db/repositories/candlesRepository";
import { getSourceRunById } from "@/lib/db/repositories/sourceRunsRepository";
import { listActiveSymbols } from "@/lib/db/repositories/symbolsRepository";
import { runFredCollection } from "./fredCollectionService";

const originalFetch = globalThis.fetch;

function createMemoryDatabase() {
  const db = new Database(":memory:");
  runMigrations(db);
  return db;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("FRED collection service", () => {
  it("keeps the complete Phase 2 asset list configured as inactive daily FRED symbols", () => {
    assert.deepEqual(
      phase2Symbols.map((symbol) => symbol.symbol),
      ["XAUUSD", "WTI", "NASDAQ100", "SPX", "DXY", "US10Y", "VIX"]
    );
    assert.equal(phase2Symbols.every((symbol) => symbol.source === "fred"), true);
    assert.equal(phase2Symbols.every((symbol) => symbol.providerSymbol), true);
    assert.equal(phase2Symbols.every((symbol) => symbol.isActive === false), true);
  });

  it("fetches, normalizes, stores, and logs the starter cross-market asset", async () => {
    const db = createMemoryDatabase();

    globalThis.fetch = (async () =>
      new Response(
        [
          "observation_date,DGS10",
          "2026-05-21,4.08",
          "2026-05-22,4.12"
        ].join("\n"),
        { status: 200 }
      )) as typeof fetch;

    const result = await runFredCollection({
      db,
      symbols: ["US10Y"],
      timeframes: ["1d"],
      limit: 2
    });

    const candles = getCandlesBySymbolTimeframe(db, "US10Y", "1d", 10);
    const sourceRun = getSourceRunById(db, result.sourceRunId);
    const activeSymbols = listActiveSymbols(db);

    assert.equal(result.status, "ok");
    assert.equal(result.candlesFetched, 2);
    assert.equal(result.candlesInsertedOrUpdated, 2);
    assert.equal(candles.length, 2);
    assert.equal(candles[0].source, "fred");
    assert.equal(candles[1].close, 4.12);
    assert.equal(sourceRun?.source, "fred");
    assert.equal(sourceRun?.collectorId, "fred_daily_series");
    assert.equal(sourceRun?.status, "success");
    assert.equal(activeSymbols.some((symbol) => symbol.symbol === "US10Y"), false);
  });

  it("collects multiple configured Phase 2 assets through provider-symbol mappings", async () => {
    const db = createMemoryDatabase();
    const requestedUrls: string[] = [];

    globalThis.fetch = (async (input) => {
      const url =
        input instanceof URL
          ? input
          : typeof input === "string"
            ? new URL(input)
            : new URL(input.url);
      const seriesId = url.searchParams.get("id");
      requestedUrls.push(url.toString());

      if (seriesId === "NASDAQ100") {
        return new Response(["observation_date,NASDAQ100", "2026-05-21,5000"].join("\n"), {
          status: 200
        });
      }

      if (seriesId === "DTWEXBGS") {
        return new Response(["observation_date,DTWEXBGS", "2026-05-21,120.5"].join("\n"), {
          status: 200
        });
      }

      return new Response("Not found", { status: 404 });
    }) as typeof fetch;

    const result = await runFredCollection({
      db,
      symbols: ["NASDAQ100", "DXY"],
      timeframes: ["1d"],
      limit: 1
    });

    const nasdaqCandles = getCandlesBySymbolTimeframe(db, "NASDAQ100", "1d", 10);
    const dxyCandles = getCandlesBySymbolTimeframe(db, "DXY", "1d", 10);

    assert.equal(result.status, "ok");
    assert.equal(result.symbolsProcessed, 2);
    assert.equal(result.candlesFetched, 2);
    assert.equal(nasdaqCandles[0].close, 5000);
    assert.equal(dxyCandles[0].close, 120.5);
    assert.equal(requestedUrls.some((url) => url.includes("id=NASDAQ100")), true);
    assert.equal(requestedUrls.some((url) => url.includes("id=DTWEXBGS")), true);
  });

  it("logs source-run failure when FRED returns invalid data", async () => {
    const db = createMemoryDatabase();

    globalThis.fetch = (async () => new Response("No data", { status: 200 })) as typeof fetch;

    const result = await runFredCollection({
      db,
      symbols: ["US10Y"],
      timeframes: ["1d"],
      limit: 2
    });
    const sourceRun = getSourceRunById(db, result.sourceRunId);

    assert.equal(result.status, "error");
    assert.equal(result.candlesFetched, 0);
    assert.equal(result.errors.length, 1);
    assert.equal(sourceRun?.status, "failure");
    assert.match(sourceRun?.errorMessage ?? "", /FRED collection/);
  });
});
