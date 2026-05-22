import assert from "node:assert/strict";
import test from "node:test";
import {
  movingAverage,
  rsi,
  supportResistance,
  volumeTrend,
  type IndicatorCandle
} from ".";

function candle(index: number, close: number, overrides: Partial<IndicatorCandle> = {}): IndicatorCandle {
  return {
    openTime: index * 60_000,
    closeTime: index * 60_000 + 59_999,
    open: close - 0.5,
    high: close + 1,
    low: close - 1,
    close,
    volume: 100,
    ...overrides
  };
}

test("movingAverage returns the average of the latest period", () => {
  const candles = [1, 2, 3, 4, 5].map((close, index) => candle(index, close));

  assert.equal(movingAverage(candles, 3), 4);
  assert.equal(movingAverage(candles, 6), null);
});

test("rsi returns 100 for uninterrupted gains and 50 for flat prices", () => {
  const rising = Array.from({ length: 16 }, (_, index) => candle(index, index + 1));
  const flat = Array.from({ length: 16 }, (_, index) => candle(index, 10));

  assert.equal(rsi(rising, 14), 100);
  assert.equal(rsi(flat, 14), 50);
});

test("volumeTrend compares recent volume against previous baseline", () => {
  const candles = [
    ...Array.from({ length: 20 }, (_, index) => candle(index, 10, { volume: 100 })),
    ...Array.from({ length: 5 }, (_, index) => candle(index + 20, 10, { volume: 160 }))
  ];

  const result = volumeTrend(candles, 5, 20, 0.15);

  assert.equal(result.direction, "rising");
  assert.equal(result.recentAverage, 160);
  assert.equal(result.baselineAverage, 100);
  assert.equal(result.ratio, 1.6);
});

test("supportResistance estimates nearby swing zones", () => {
  const candles = [
    candle(0, 10, { low: 9, high: 12 }),
    candle(1, 11, { low: 10, high: 13 }),
    candle(2, 12, { low: 8, high: 14 }),
    candle(3, 11, { low: 10, high: 13 }),
    candle(4, 12, { low: 11, high: 15 }),
    candle(5, 13, { low: 12, high: 16 }),
    candle(6, 12, { low: 10, high: 14 }),
    candle(7, 13, { low: 12, high: 17 }),
    candle(8, 14, { low: 13, high: 15 })
  ];

  const result = supportResistance(candles, 9, 1, 0.001);

  assert.equal(result.currentPrice, 14);
  assert.equal(result.support?.price, 10);
  assert.equal(result.resistance?.price, 14);
  assert.ok(result.swingSupports.length > 0);
  assert.ok(result.swingResistances.length > 0);
});
