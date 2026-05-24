import type { IndicatorCandle } from "@/lib/indicators";
import type {
  AlignedReturnPoint,
  ReturnPoint,
  RollingCorrelationPoint,
  ShortTermDivergence,
  VolatilityAdjustedMovement
} from "./types";

function mean(values: number[]) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) {
    return null;
  }

  const average = mean(values);
  const variance =
    values.reduce((total, value) => total + (value - average) ** 2, 0) / (values.length - 1);

  return Math.sqrt(variance);
}

function round(value: number, decimals = 6) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function percentageReturns(candles: IndicatorCandle[]): ReturnPoint[] {
  const sorted = [...candles].sort((a, b) => a.openTime - b.openTime);
  const points: ReturnPoint[] = [];

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];

    if (!previous || !current || previous.close === 0) {
      continue;
    }

    points.push({
      time: current.openTime,
      value: round((current.close - previous.close) / previous.close)
    });
  }

  return points;
}

export function alignReturns(left: ReturnPoint[], right: ReturnPoint[]): AlignedReturnPoint[] {
  const rightByTime = new Map(right.map((point) => [point.time, point.value]));

  return left.flatMap((leftPoint) => {
    const rightValue = rightByTime.get(leftPoint.time);

    if (rightValue === undefined) {
      return [];
    }

    return [
      {
        time: leftPoint.time,
        left: leftPoint.value,
        right: rightValue
      }
    ];
  });
}

export function pearsonCorrelation(left: number[], right: number[]) {
  if (left.length !== right.length || left.length < 2) {
    return null;
  }

  const leftMean = mean(left);
  const rightMean = mean(right);
  let covariance = 0;
  let leftVariance = 0;
  let rightVariance = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index] - leftMean;
    const rightDelta = right[index] - rightMean;

    covariance += leftDelta * rightDelta;
    leftVariance += leftDelta ** 2;
    rightVariance += rightDelta ** 2;
  }

  const denominator = Math.sqrt(leftVariance * rightVariance);

  if (denominator === 0) {
    return null;
  }

  return round(covariance / denominator);
}

export function rollingCorrelation(
  alignedReturns: AlignedReturnPoint[],
  window: number
): RollingCorrelationPoint[] {
  if (!Number.isInteger(window) || window < 2) {
    throw new Error("Rolling correlation window must be an integer greater than 1");
  }

  return alignedReturns.map((point, index) => {
    if (index + 1 < window) {
      return {
        time: point.time,
        value: null,
        sampleSize: index + 1
      };
    }

    const sample = alignedReturns.slice(index + 1 - window, index + 1);

    return {
      time: point.time,
      value: pearsonCorrelation(
        sample.map((item) => item.left),
        sample.map((item) => item.right)
      ),
      sampleSize: sample.length
    };
  });
}

export function cumulativeReturn(points: ReturnPoint[]) {
  if (points.length === 0) {
    return null;
  }

  const compounded = points.reduce((total, point) => total * (1 + point.value), 1) - 1;
  return round(compounded);
}

export function shortTermDivergence(
  alignedReturns: AlignedReturnPoint[],
  window: number,
  threshold = 0.01
): ShortTermDivergence {
  if (!Number.isInteger(window) || window < 1) {
    throw new Error("Divergence window must be a positive integer");
  }

  const sample = alignedReturns.slice(-window);

  if (sample.length < window) {
    return {
      leftCumulativeReturn: null,
      rightCumulativeReturn: null,
      spread: null,
      absSpread: null,
      direction: "insufficient_data",
      sampleSize: sample.length
    };
  }

  const leftCumulativeReturn = cumulativeReturn(
    sample.map((point) => ({ time: point.time, value: point.left }))
  );
  const rightCumulativeReturn = cumulativeReturn(
    sample.map((point) => ({ time: point.time, value: point.right }))
  );
  const spread = round((leftCumulativeReturn ?? 0) - (rightCumulativeReturn ?? 0));
  const absSpread = Math.abs(spread);

  return {
    leftCumulativeReturn,
    rightCumulativeReturn,
    spread,
    absSpread: round(absSpread),
    direction:
      absSpread < threshold
        ? "aligned"
        : spread > 0
          ? "left_outperforming"
          : "right_outperforming",
    sampleSize: sample.length
  };
}

export function volatilityAdjustedMovement(
  returns: ReturnPoint[],
  window: number
): VolatilityAdjustedMovement {
  if (!Number.isInteger(window) || window < 2) {
    throw new Error("Volatility window must be an integer greater than 1");
  }

  const sample = returns.slice(-window);

  if (sample.length < window) {
    return {
      latestReturn: null,
      meanReturn: null,
      volatility: null,
      zScore: null,
      sampleSize: sample.length
    };
  }

  const values = sample.map((point) => point.value);
  const latestReturn = values[values.length - 1];
  const meanReturn = mean(values);
  const volatility = standardDeviation(values);

  return {
    latestReturn: round(latestReturn),
    meanReturn: round(meanReturn),
    volatility: volatility === null ? null : round(volatility),
    zScore: volatility === null || volatility === 0 ? null : round((latestReturn - meanReturn) / volatility),
    sampleSize: sample.length
  };
}
