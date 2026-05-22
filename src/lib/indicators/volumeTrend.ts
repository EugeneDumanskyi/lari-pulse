import type { IndicatorCandle, SignalDirection } from "./types";

export interface VolumeTrendResult {
  direction: SignalDirection;
  recentAverage: number | null;
  baselineAverage: number | null;
  ratio: number | null;
  changePct: number | null;
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function volumeTrend(
  candles: IndicatorCandle[],
  recentPeriod = 5,
  baselinePeriod = 20,
  threshold = 0.15
): VolumeTrendResult {
  if (
    !Number.isInteger(recentPeriod) ||
    !Number.isInteger(baselinePeriod) ||
    recentPeriod <= 0 ||
    baselinePeriod <= 0
  ) {
    throw new Error("Volume trend periods must be positive integers");
  }

  if (threshold < 0) {
    throw new Error("Volume trend threshold cannot be negative");
  }

  if (candles.length < recentPeriod + baselinePeriod) {
    return {
      direction: "insufficient_data",
      recentAverage: null,
      baselineAverage: null,
      ratio: null,
      changePct: null
    };
  }

  const recent = candles.slice(-recentPeriod);
  const baseline = candles.slice(-(recentPeriod + baselinePeriod), -recentPeriod);
  const recentAverage = average(recent.map((candle) => candle.volume));
  const baselineAverage = average(baseline.map((candle) => candle.volume));
  const ratio = baselineAverage === 0 ? null : recentAverage / baselineAverage;
  const changePct = ratio === null ? null : (ratio - 1) * 100;

  let direction: SignalDirection = "stable";

  if (ratio !== null && ratio >= 1 + threshold) {
    direction = "rising";
  } else if (ratio !== null && ratio <= 1 - threshold) {
    direction = "falling";
  }

  return {
    direction,
    recentAverage,
    baselineAverage,
    ratio,
    changePct
  };
}
