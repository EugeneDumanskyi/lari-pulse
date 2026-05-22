import type { IndicatorCandle } from "./types";

export type CandleStructureFeature =
  | "higher_lows"
  | "lower_highs"
  | "large_body"
  | "upper_wick_rejection"
  | "lower_wick_rejection"
  | "mixed"
  | "insufficient_data";

export interface CandleStructureResult {
  primary: CandleStructureFeature;
  features: CandleStructureFeature[];
  bodyPctOfRange: number | null;
  upperWickPctOfRange: number | null;
  lowerWickPctOfRange: number | null;
  sampleSize: number;
}

function isStrictlyIncreasing(values: number[]) {
  return values.every((value, index) => index === 0 || value > values[index - 1]);
}

function isStrictlyDecreasing(values: number[]) {
  return values.every((value, index) => index === 0 || value < values[index - 1]);
}

export function candleStructure(candles: IndicatorCandle[], lookback = 5): CandleStructureResult {
  if (!Number.isInteger(lookback) || lookback <= 1) {
    throw new Error("Candle structure lookback must be an integer greater than 1");
  }

  if (candles.length < lookback) {
    return {
      primary: "insufficient_data",
      features: ["insufficient_data"],
      bodyPctOfRange: null,
      upperWickPctOfRange: null,
      lowerWickPctOfRange: null,
      sampleSize: candles.length
    };
  }

  const sample = candles.slice(-lookback);
  const latest = sample.at(-1)!;
  const range = latest.high - latest.low;
  const body = Math.abs(latest.close - latest.open);
  const upperWick = latest.high - Math.max(latest.open, latest.close);
  const lowerWick = Math.min(latest.open, latest.close) - latest.low;
  const bodyPctOfRange = range === 0 ? 0 : body / range;
  const upperWickPctOfRange = range === 0 ? 0 : upperWick / range;
  const lowerWickPctOfRange = range === 0 ? 0 : lowerWick / range;
  const features: CandleStructureFeature[] = [];

  if (isStrictlyIncreasing(sample.map((candle) => candle.low))) {
    features.push("higher_lows");
  }

  if (isStrictlyDecreasing(sample.map((candle) => candle.high))) {
    features.push("lower_highs");
  }

  if (bodyPctOfRange >= 0.65) {
    features.push("large_body");
  }

  if (upperWickPctOfRange >= 0.45 && upperWickPctOfRange > lowerWickPctOfRange) {
    features.push("upper_wick_rejection");
  }

  if (lowerWickPctOfRange >= 0.45 && lowerWickPctOfRange > upperWickPctOfRange) {
    features.push("lower_wick_rejection");
  }

  if (features.length === 0) {
    features.push("mixed");
  }

  return {
    primary: features[0],
    features,
    bodyPctOfRange,
    upperWickPctOfRange,
    lowerWickPctOfRange,
    sampleSize: sample.length
  };
}
