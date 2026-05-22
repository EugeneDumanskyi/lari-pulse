import type { IndicatorCandle, IndicatorPoint } from "./types";

function validatePeriod(period: number) {
  if (!Number.isInteger(period) || period <= 0) {
    throw new Error("ATR period must be a positive integer");
  }
}

export function trueRange(candle: IndicatorCandle, previous?: IndicatorCandle) {
  if (!previous) {
    return candle.high - candle.low;
  }

  return Math.max(
    candle.high - candle.low,
    Math.abs(candle.high - previous.close),
    Math.abs(candle.low - previous.close)
  );
}

export function averageTrueRange(candles: IndicatorCandle[], period = 14) {
  const series = averageTrueRangeSeries(candles, period);
  const latest = series.at(-1);

  return latest?.value ?? null;
}

export function averageTrueRangeSeries(candles: IndicatorCandle[], period = 14): IndicatorPoint[] {
  validatePeriod(period);

  if (candles.length === 0) {
    return [];
  }

  const ranges = candles.map((candle, index) => trueRange(candle, candles[index - 1]));

  return candles.map((candle, index) => {
    if (index + 1 < period) {
      return {
        time: candle.closeTime,
        value: null
      };
    }

    const window = ranges.slice(index + 1 - period, index + 1);
    const total = window.reduce((sum, range) => sum + range, 0);

    return {
      time: candle.closeTime,
      value: total / period
    };
  });
}
