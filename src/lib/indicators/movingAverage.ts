import type { CandleNumericField, IndicatorCandle, IndicatorPoint } from "./types";

function validatePeriod(period: number) {
  if (!Number.isInteger(period) || period <= 0) {
    throw new Error("Moving average period must be a positive integer");
  }
}

export function movingAverage(
  candles: IndicatorCandle[],
  period: number,
  field: CandleNumericField = "close"
) {
  validatePeriod(period);

  if (candles.length < period) {
    return null;
  }

  const window = candles.slice(-period);
  const total = window.reduce((sum, candle) => sum + candle[field], 0);

  return total / period;
}

export function movingAverageSeries(
  candles: IndicatorCandle[],
  period: number,
  field: CandleNumericField = "close"
): IndicatorPoint[] {
  validatePeriod(period);

  return candles.map((candle, index) => {
    if (index + 1 < period) {
      return {
        time: candle.closeTime,
        value: null
      };
    }

    const window = candles.slice(index + 1 - period, index + 1);
    const total = window.reduce((sum, item) => sum + item[field], 0);

    return {
      time: candle.closeTime,
      value: total / period
    };
  });
}
