import type { IndicatorCandle, IndicatorPoint } from "./types";

function validatePeriod(period: number) {
  if (!Number.isInteger(period) || period <= 0) {
    throw new Error("RSI period must be a positive integer");
  }
}

function calculateRsiFromAverages(averageGain: number, averageLoss: number) {
  if (averageLoss === 0) {
    return averageGain === 0 ? 50 : 100;
  }

  const relativeStrength = averageGain / averageLoss;

  return 100 - 100 / (1 + relativeStrength);
}

export function rsi(candles: IndicatorCandle[], period = 14) {
  const series = rsiSeries(candles, period);
  const latest = series.at(-1);

  return latest?.value ?? null;
}

export function rsiSeries(candles: IndicatorCandle[], period = 14): IndicatorPoint[] {
  validatePeriod(period);

  if (candles.length === 0) {
    return [];
  }

  const points: IndicatorPoint[] = candles.map((candle) => ({
    time: candle.closeTime,
    value: null
  }));

  if (candles.length <= period) {
    return points;
  }

  let totalGain = 0;
  let totalLoss = 0;

  for (let index = 1; index <= period; index += 1) {
    const change = candles[index].close - candles[index - 1].close;
    totalGain += Math.max(change, 0);
    totalLoss += Math.max(-change, 0);
  }

  let averageGain = totalGain / period;
  let averageLoss = totalLoss / period;
  points[period].value = calculateRsiFromAverages(averageGain, averageLoss);

  for (let index = period + 1; index < candles.length; index += 1) {
    const change = candles[index].close - candles[index - 1].close;
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);

    averageGain = (averageGain * (period - 1) + gain) / period;
    averageLoss = (averageLoss * (period - 1) + loss) / period;
    points[index].value = calculateRsiFromAverages(averageGain, averageLoss);
  }

  return points;
}
