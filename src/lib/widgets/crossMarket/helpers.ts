import { movingAverage } from "@/lib/indicators";
import type { CandleRecord } from "@/lib/db/types";
import type { SourceRef, WidgetContext, WidgetSeverity } from "../types";
import { clamp, round } from "../crypto/helpers";

export type CrossMarketAssetSymbol =
  | "BTCUSDT"
  | "ETHUSDT"
  | "SOLUSDT"
  | "DXY"
  | "US10Y"
  | "NASDAQ100"
  | "SPX"
  | "XAUUSD"
  | "WTI"
  | "VIX";

export type CrossMarketTrend = "bullish" | "bearish" | "mixed" | "insufficient_data";

export interface CrossMarketTrendSignal {
  symbol: CrossMarketAssetSymbol;
  label: string;
  trend: CrossMarketTrend;
  latestClose: number | null;
  ma5: number | null;
  ma20: number | null;
  change5Pct: number | null;
  volatility20Pct: number | null;
  candleCount: number;
  updatedAt: string | null;
  source: string | null;
}

export const DEFAULT_CROSS_MARKET_TIMEFRAME = "1d";
export const CROSS_MARKET_REQUIRED_CANDLES = 20;

export const CROSS_MARKET_LABELS: Record<CrossMarketAssetSymbol, string> = {
  BTCUSDT: "BTC",
  ETHUSDT: "ETH",
  SOLUSDT: "SOL",
  DXY: "Dollar index",
  US10Y: "US 10Y yield",
  NASDAQ100: "Nasdaq 100",
  SPX: "S&P 500",
  XAUUSD: "Gold",
  WTI: "WTI oil",
  VIX: "VIX"
};

function latestCandle(candles: CandleRecord[]) {
  return candles.length > 0 ? candles[candles.length - 1] : null;
}

function closeToCloseVolatility(candles: CandleRecord[], window = 20) {
  if (candles.length < window + 1) {
    return null;
  }

  const windowCandles = candles.slice(-(window + 1));
  const returns = windowCandles.slice(1).map((candle, index) => {
    const previous = windowCandles[index].close;

    return previous === 0 ? 0 : (candle.close - previous) / previous;
  });
  const mean = returns.reduce((total, value) => total + value, 0) / returns.length;
  const variance =
    returns.reduce((total, value) => total + (value - mean) ** 2, 0) / returns.length;

  return Math.sqrt(variance) * 100;
}

export function analyzeCrossMarketTrend(
  symbol: CrossMarketAssetSymbol,
  candles: CandleRecord[],
  label = CROSS_MARKET_LABELS[symbol]
): CrossMarketTrendSignal {
  const latest = latestCandle(candles);

  if (candles.length < CROSS_MARKET_REQUIRED_CANDLES || !latest) {
    return {
      symbol,
      label,
      trend: "insufficient_data",
      latestClose: latest?.close ?? null,
      ma5: null,
      ma20: null,
      change5Pct: null,
      volatility20Pct: null,
      candleCount: candles.length,
      updatedAt: latest ? new Date(latest.closeTime).toISOString() : null,
      source: latest?.source ?? null
    };
  }

  const previous5 = candles.at(-6);
  const ma5 = movingAverage(candles, 5)!;
  const ma20 = movingAverage(candles, 20)!;
  const change5Pct = previous5 ? ((latest.close - previous5.close) / previous5.close) * 100 : 0;
  let trend: CrossMarketTrend = "mixed";

  if (latest.close > ma20 && ma5 > ma20 && change5Pct > 0) {
    trend = "bullish";
  } else if (latest.close < ma20 && ma5 < ma20 && change5Pct < 0) {
    trend = "bearish";
  }

  return {
    symbol,
    label,
    trend,
    latestClose: latest.close,
    ma5,
    ma20,
    change5Pct,
    volatility20Pct: closeToCloseVolatility(candles),
    candleCount: candles.length,
    updatedAt: new Date(latest.closeTime).toISOString(),
    source: latest.source
  };
}

export function trendValue(trend: CrossMarketTrend) {
  if (trend === "bullish") {
    return 1;
  }

  if (trend === "bearish") {
    return -1;
  }

  return 0;
}

export function signalDetails(signal: CrossMarketTrendSignal) {
  return {
    label: signal.label,
    trend: signal.trend,
    latestClose: signal.latestClose,
    ma5: signal.ma5 === null ? null : round(signal.ma5, 4),
    ma20: signal.ma20 === null ? null : round(signal.ma20, 4),
    change5Pct: signal.change5Pct === null ? null : round(signal.change5Pct, 2),
    volatility20Pct: signal.volatility20Pct === null ? null : round(signal.volatility20Pct, 2),
    candleCount: signal.candleCount
  };
}

export function latestUpdatedAt(signals: CrossMarketTrendSignal[], fallback: Date) {
  return (
    signals
      .map((signal) => signal.updatedAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? fallback.toISOString()
  );
}

export function sourceRefs(signals: CrossMarketTrendSignal[], updatedAt: string): SourceRef[] {
  const candleSources = signals
    .filter((signal) => signal.updatedAt && signal.source)
    .map((signal) => ({
      source: signal.source!,
      type: "ohlcv",
      symbol: signal.symbol,
      timeframe: DEFAULT_CROSS_MARKET_TIMEFRAME,
      updatedAt: signal.updatedAt!
    }));

  return [
    ...candleSources,
    {
      source: "internal",
      type: "cross_market_widget",
      timeframe: DEFAULT_CROSS_MARKET_TIMEFRAME,
      updatedAt
    }
  ];
}

export function missingWarnings(signals: CrossMarketTrendSignal[]) {
  return signals
    .filter((signal) => signal.trend === "insufficient_data")
    .map((signal) => `${signal.symbol} has ${signal.candleCount} candles; ${CROSS_MARKET_REQUIRED_CANDLES} required`);
}

export function coverageConfidence(signals: CrossMarketTrendSignal[], conflictPenalty = 0) {
  const coverage = signals.filter((signal) => signal.trend !== "insufficient_data").length / signals.length;

  return round(clamp(0.3 + coverage * 0.45 - conflictPenalty, 0.2, 0.86), 2);
}

export function scoreSeverity(score: number): WidgetSeverity {
  if (score >= 72 || score <= 28) {
    return "high";
  }

  if (score >= 58 || score <= 42) {
    return "medium";
  }

  return "low";
}

export function getTrendSignal(
  context: WidgetContext,
  symbol: CrossMarketAssetSymbol,
  timeframe: string
) {
  const candles = context.marketContext?.assetCandles?.[symbol]?.[timeframe] ?? [];

  return analyzeCrossMarketTrend(symbol, candles);
}

export function normalizedScore(raw: number) {
  return Math.round(clamp(raw, 0, 100));
}
