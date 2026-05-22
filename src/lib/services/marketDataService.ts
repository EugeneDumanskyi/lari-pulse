import type Database from "better-sqlite3";
import type { MarketOverviewApi } from "@/lib/api/types";
import { getDatabase } from "@/lib/db/client";
import { initializeDatabase } from "@/lib/db/initialize";
import { getCandlesBySymbolTimeframe } from "@/lib/db/repositories/candlesRepository";

const timeframeDurationsMs: Record<string, number> = {
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000
};

function round(value: number, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function getMarketOverview(
  filters: { symbol: string; timeframe: string; limit?: number },
  db?: Database.Database
): MarketOverviewApi {
  const database = db ?? getDatabase();

  if (!db) {
    initializeDatabase();
  }

  const candles = getCandlesBySymbolTimeframe(database, filters.symbol, filters.timeframe, filters.limit ?? 120);
  const latest = candles.at(-1);
  const previous = candles.at(-2);
  const periodHigh = candles.length > 0 ? Math.max(...candles.map((candle) => candle.high)) : null;
  const periodLow = candles.length > 0 ? Math.min(...candles.map((candle) => candle.low)) : null;
  const periodVolume =
    candles.length > 0 ? candles.reduce((total, candle) => total + candle.volume, 0) : null;
  const change = latest && previous ? latest.close - previous.close : null;
  const changePercent = change !== null && previous?.close ? (change / previous.close) * 100 : null;
  const updatedAt = latest ? new Date(latest.closeTime).toISOString() : null;
  const durationMs = timeframeDurationsMs[filters.timeframe] ?? 60 * 60 * 1000;
  const ageMs = latest ? Date.now() - latest.closeTime : null;
  const isStale = ageMs === null || ageMs > durationMs * 2.5;

  return {
    symbol: filters.symbol,
    timeframe: filters.timeframe,
    candles: candles.map((candle) => ({
      openTime: candle.openTime,
      closeTime: candle.closeTime,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume
    })),
    metrics: {
      latestPrice: latest ? latest.close : null,
      previousClose: previous ? previous.close : null,
      change: change === null ? null : round(change),
      changePercent: changePercent === null ? null : round(changePercent, 2),
      periodHigh: periodHigh === null ? null : round(periodHigh),
      periodLow: periodLow === null ? null : round(periodLow),
      periodVolume: periodVolume === null ? null : round(periodVolume, 2),
      candleCount: candles.length,
      updatedAt,
      isStale,
      staleReason: isStale
        ? latest
          ? `Latest ${filters.timeframe} candle closed at ${updatedAt}`
          : "No stored candles are available for this market"
        : null
    }
  };
}
