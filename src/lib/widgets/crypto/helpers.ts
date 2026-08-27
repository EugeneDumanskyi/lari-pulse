import type { CandleRecord } from "@/lib/db/types";
import { getTimeframeCandles as getMarketContextTimeframeCandles } from "../marketContext";
import type { SourceRef, WidgetContext, WidgetResult, WidgetSeverity } from "../types";

export type DirectionBias = "bullish" | "bearish" | "neutral" | "mixed";

export interface TimeframeCandleContext {
  timeframeCandles?: Record<string, CandleRecord[]>;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function round(value: number, decimals = 2) {
  const factor = 10 ** decimals;

  return Math.round(value * factor) / factor;
}

export function scoreFromRatio(ratio: number, neutral = 0, scale = 1) {
  return clamp(50 + ((ratio - neutral) / scale) * 50, 0, 100);
}

export function severityFromScore(score: number): WidgetSeverity {
  if (score >= 70 || score <= 30) {
    return "high";
  }

  if (score >= 58 || score <= 42) {
    return "medium";
  }

  return "low";
}

export function confidenceFromData(candles: CandleRecord[] | undefined, minimumCandles: number) {
  if (!candles || candles.length === 0) {
    return 0.2;
  }

  return clamp(0.35 + (candles.length / minimumCandles) * 0.45, 0.35, 0.8);
}

export function getLatestCandle(candles: CandleRecord[] | undefined) {
  return candles && candles.length > 0 ? candles[candles.length - 1] : null;
}

export function getSourceRefs(context: WidgetContext, candles: CandleRecord[] | undefined): SourceRef[] {
  const latest = getLatestCandle(candles);

  return [
    {
      source: latest?.source ?? "unknown",
      type: "ohlcv",
      symbol: context.symbol,
      timeframe: context.timeframe,
      updatedAt: latest ? new Date(latest.closeTime).toISOString() : context.now.toISOString()
    }
  ];
}

export function insufficientDataResult(
  widgetId: string,
  context: WidgetContext,
  reason: string
): WidgetResult {
  return {
    widgetId,
    symbol: context.symbol,
    timeframe: context.timeframe,
    score: 50,
    direction: "mixed",
    confidence: 0.2,
    severity: "low",
    summary: `${reason}; signal remains neutral until more candle history is available.`,
    details: {
      reason,
      candleCount: context.candles?.length ?? 0
    },
    sources: getSourceRefs(context, context.candles),
    updatedAt: context.now.toISOString()
  };
}

export function latestUpdatedAt(context: WidgetContext, candles: CandleRecord[] | undefined) {
  const latest = getLatestCandle(candles);

  return latest ? new Date(latest.closeTime).toISOString() : context.now.toISOString();
}

export function getTimeframeCandles(context: WidgetContext) {
  const marketContext = context.marketContext as TimeframeCandleContext | undefined;

  if (!marketContext?.timeframeCandles) {
    return {};
  }

  return Object.fromEntries(
    Object.keys(marketContext.timeframeCandles).map((timeframe) => [
      timeframe,
      getMarketContextTimeframeCandles(context.marketContext, timeframe)
    ])
  );
}

export function trendBiasFromInputs(price: number, ma7: number, ma30: number) {
  if (price > ma7 && price > ma30 && ma7 > ma30) {
    return "bullish" satisfies DirectionBias;
  }

  if (price < ma7 && price < ma30 && ma7 < ma30) {
    return "bearish" satisfies DirectionBias;
  }

  if (Math.abs(price - ma30) / ma30 < 0.003) {
    return "neutral" satisfies DirectionBias;
  }

  return "mixed" satisfies DirectionBias;
}
