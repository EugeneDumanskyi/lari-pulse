import type Database from "better-sqlite3";
import {
  alignReturns,
  percentageReturns,
  crossMarketCorrelationPairs,
  rollingCorrelation,
  shortTermDivergence,
  volatilityAdjustedMovement,
  type CorrelationPairConfig,
  type CorrelationPairResult
} from "@/lib/correlations";
import { getDatabase } from "@/lib/db/client";
import { getCandlesBySymbolTimeframe } from "@/lib/db/repositories/candlesRepository";

export interface CorrelationCalculationOptions {
  timeframe?: string;
  candleLimit?: number;
  correlationWindow?: number;
  divergenceWindow?: number;
  volatilityWindow?: number;
  pairs?: CorrelationPairConfig[];
  db?: Database.Database;
}

export interface CorrelationCalculationResult {
  timeframe: string;
  correlationWindow: number;
  divergenceWindow: number;
  volatilityWindow: number;
  pairs: CorrelationPairResult[];
  updatedAt: string;
}

const DEFAULT_TIMEFRAME = "1d";
const DEFAULT_CANDLE_LIMIT = 260;
const DEFAULT_CORRELATION_WINDOW = 30;
const DEFAULT_DIVERGENCE_WINDOW = 5;
const DEFAULT_VOLATILITY_WINDOW = 20;

function latestTime(leftUpdatedAt: string | null, rightUpdatedAt: string | null) {
  if (!leftUpdatedAt) {
    return rightUpdatedAt;
  }

  if (!rightUpdatedAt) {
    return leftUpdatedAt;
  }

  return new Date(leftUpdatedAt).getTime() > new Date(rightUpdatedAt).getTime()
    ? leftUpdatedAt
    : rightUpdatedAt;
}

export function calculateCorrelationPairs(
  options: CorrelationCalculationOptions = {}
): CorrelationCalculationResult {
  const db = options.db ?? getDatabase();
  const timeframe = options.timeframe ?? DEFAULT_TIMEFRAME;
  const candleLimit = options.candleLimit ?? DEFAULT_CANDLE_LIMIT;
  const correlationWindow = options.correlationWindow ?? DEFAULT_CORRELATION_WINDOW;
  const divergenceWindow = options.divergenceWindow ?? DEFAULT_DIVERGENCE_WINDOW;
  const volatilityWindow = options.volatilityWindow ?? DEFAULT_VOLATILITY_WINDOW;
  const pairs = options.pairs ?? crossMarketCorrelationPairs;
  const candleCache = new Map<string, ReturnType<typeof getCandlesBySymbolTimeframe>>();

  function candlesFor(symbol: string) {
    const key = `${symbol}:${timeframe}:${candleLimit}`;
    const cached = candleCache.get(key);

    if (cached) {
      return cached;
    }

    const candles = getCandlesBySymbolTimeframe(db, symbol, timeframe, candleLimit);
    candleCache.set(key, candles);
    return candles;
  }

  const results = pairs.map((pair): CorrelationPairResult => {
    const leftCandles = candlesFor(pair.leftSymbol);
    const rightCandles = candlesFor(pair.rightSymbol);
    const leftReturns = percentageReturns(leftCandles);
    const rightReturns = percentageReturns(rightCandles);
    const aligned = alignReturns(leftReturns, rightReturns);
    const rolling = rollingCorrelation(aligned, correlationWindow);
    const latestCorrelation = [...rolling].reverse().find((point) => point.value !== null)?.value ?? null;
    const warnings: string[] = [];

    if (leftCandles.length < 2) {
      warnings.push(`${pair.leftSymbol} has insufficient candle history`);
    }

    if (rightCandles.length < 2) {
      warnings.push(`${pair.rightSymbol} has insufficient candle history`);
    }

    if (aligned.length < correlationWindow) {
      warnings.push(
        `${pair.label} has ${aligned.length} aligned returns; ${correlationWindow} required for full-window correlation`
      );
    }

    const leftUpdatedAt =
      leftCandles.length > 0 ? new Date(leftCandles[leftCandles.length - 1].closeTime).toISOString() : null;
    const rightUpdatedAt =
      rightCandles.length > 0 ? new Date(rightCandles[rightCandles.length - 1].closeTime).toISOString() : null;

    return {
      ...pair,
      timeframe,
      observations: aligned.length,
      latestCorrelation,
      rollingCorrelation: rolling,
      divergence: shortTermDivergence(aligned, divergenceWindow),
      leftVolatilityAdjustedMovement: volatilityAdjustedMovement(leftReturns, volatilityWindow),
      rightVolatilityAdjustedMovement: volatilityAdjustedMovement(rightReturns, volatilityWindow),
      updatedAt: latestTime(leftUpdatedAt, rightUpdatedAt),
      warnings
    };
  });

  return {
    timeframe,
    correlationWindow,
    divergenceWindow,
    volatilityWindow,
    pairs: results,
    updatedAt: new Date().toISOString()
  };
}
