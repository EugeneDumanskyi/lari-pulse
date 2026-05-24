import assert from "node:assert/strict";
import test from "node:test";
import {
  alignReturns,
  percentageReturns,
  pearsonCorrelation,
  rollingCorrelation,
  shortTermDivergence,
  volatilityAdjustedMovement
} from ".";
import type { IndicatorCandle } from "@/lib/indicators";

function candle(day: number, close: number): IndicatorCandle {
  const openTime = Date.UTC(2026, 0, day);

  return {
    openTime,
    closeTime: openTime + 86_400_000 - 1,
    open: close,
    high: close,
    low: close,
    close,
    volume: 0
  };
}

test("percentageReturns calculates ordered daily close-to-close returns", () => {
  const returns = percentageReturns([candle(3, 121), candle(1, 100), candle(2, 110)]);

  assert.deepEqual(returns, [
    { time: Date.UTC(2026, 0, 2), value: 0.1 },
    { time: Date.UTC(2026, 0, 3), value: 0.1 }
  ]);
});

test("rollingCorrelation calculates Pearson correlation on aligned returns", () => {
  const left = [
    { time: 1, value: 0.01 },
    { time: 2, value: 0.02 },
    { time: 3, value: 0.03 },
    { time: 4, value: 0.04 }
  ];
  const right = [
    { time: 1, value: -0.01 },
    { time: 2, value: -0.02 },
    { time: 3, value: -0.03 },
    { time: 4, value: -0.04 }
  ];
  const aligned = alignReturns(left, right);
  const rolling = rollingCorrelation(aligned, 3);

  assert.equal(pearsonCorrelation([0.01, 0.02, 0.03], [-0.01, -0.02, -0.03]), -1);
  assert.equal(rolling[0].value, null);
  assert.equal(rolling[2].value, -1);
  assert.equal(rolling[3].value, -1);
});

test("shortTermDivergence identifies recent relative outperformance", () => {
  const divergence = shortTermDivergence(
    [
      { time: 1, left: 0.03, right: 0.01 },
      { time: 2, left: 0.02, right: -0.01 }
    ],
    2,
    0.01
  );

  assert.equal(divergence.direction, "left_outperforming");
  assert.ok((divergence.spread ?? 0) > 0.04);
});

test("volatilityAdjustedMovement reports latest return as a z-score", () => {
  const movement = volatilityAdjustedMovement(
    [
      { time: 1, value: 0.01 },
      { time: 2, value: 0.02 },
      { time: 3, value: 0.03 }
    ],
    3
  );

  assert.equal(movement.latestReturn, 0.03);
  assert.equal(movement.meanReturn, 0.02);
  assert.ok((movement.zScore ?? 0) > 0);
});
