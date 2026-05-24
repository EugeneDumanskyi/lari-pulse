import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { runMigrations } from "@/lib/db/migrations";
import { upsertCandles } from "@/lib/db/repositories/candlesRepository";
import type { NewCandle } from "@/lib/db/types";
import { calculateCorrelationPairs } from "./correlationService";

function createMemoryDatabase() {
  const db = new Database(":memory:");
  runMigrations(db);
  return db;
}

function candle(symbol: string, day: number, close: number, source = "test"): NewCandle {
  const openTime = Date.UTC(2026, 0, day);

  return {
    symbol,
    timeframe: "1d",
    openTime,
    closeTime: openTime + 86_400_000 - 1,
    open: close,
    high: close,
    low: close,
    close,
    volume: 0,
    source
  };
}

describe("correlation service", () => {
  it("calculates configured pair correlations from stored candles", () => {
    const db = createMemoryDatabase();

    upsertCandles(db, [
      candle("BTCUSDT", 1, 100, "binance"),
      candle("BTCUSDT", 2, 110, "binance"),
      candle("BTCUSDT", 3, 121, "binance"),
      candle("BTCUSDT", 4, 145.2, "binance"),
      candle("NASDAQ100", 1, 1000, "fred"),
      candle("NASDAQ100", 2, 1010, "fred"),
      candle("NASDAQ100", 3, 1020.1, "fred"),
      candle("NASDAQ100", 4, 1050.703, "fred")
    ]);

    const result = calculateCorrelationPairs({
      db,
      correlationWindow: 3,
      divergenceWindow: 2,
      volatilityWindow: 3,
      pairs: [
        {
          id: "btc_nasdaq100",
          leftSymbol: "BTCUSDT",
          rightSymbol: "NASDAQ100",
          label: "BTC vs Nasdaq 100"
        }
      ]
    });

    const pair = result.pairs[0];

    assert.equal(result.timeframe, "1d");
    assert.equal(pair.observations, 3);
    assert.equal(pair.latestCorrelation, 1);
    assert.equal(pair.divergence.direction, "left_outperforming");
    assert.equal(pair.warnings.length, 0);
    assert.equal(pair.leftVolatilityAdjustedMovement.sampleSize, 3);
    assert.equal(pair.updatedAt, new Date(Date.UTC(2026, 0, 4) + 86_400_000 - 1).toISOString());
  });

  it("returns warnings instead of throwing when stored history is insufficient", () => {
    const db = createMemoryDatabase();

    upsertCandles(db, [candle("BTCUSDT", 1, 100, "binance")]);

    const result = calculateCorrelationPairs({
      db,
      correlationWindow: 3,
      pairs: [
        {
          id: "btc_dxy",
          leftSymbol: "BTCUSDT",
          rightSymbol: "DXY",
          label: "BTC vs DXY"
        }
      ]
    });

    const pair = result.pairs[0];

    assert.equal(pair.latestCorrelation, null);
    assert.equal(pair.observations, 0);
    assert.ok(pair.warnings.some((warning) => warning.includes("BTCUSDT")));
    assert.ok(pair.warnings.some((warning) => warning.includes("DXY")));
  });
});
