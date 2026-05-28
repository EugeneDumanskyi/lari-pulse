import type Database from "better-sqlite3";
import type { MarketOverviewApi } from "@/lib/api/types";
import { fetchBinanceCandles } from "@/lib/collectors/binanceCollector";
import { getDatabase } from "@/lib/db/client";
import { initializeDatabase } from "@/lib/db/initialize";
import { getCandlesBySymbolTimeframe } from "@/lib/db/repositories/candlesRepository";
import type { NewCandle } from "@/lib/db/types";

const timeframeDurationsMs: Record<string, number> = {
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000
};

const dashboardRanges: Record<string, { sourceTimeframe: string; sourceLimit: number; label: string }> = {
  "1d": { sourceTimeframe: "1h", sourceLimit: 24, label: "1d" },
  "7d": { sourceTimeframe: "1d", sourceLimit: 7, label: "7d" },
  "30d": { sourceTimeframe: "1d", sourceLimit: 30, label: "30d" },
  "90d": { sourceTimeframe: "1d", sourceLimit: 90, label: "90d" }
};

type MarketOverviewProvider = "binance_live" | "sqlite";

interface MarketOverviewSource {
  provider: MarketOverviewProvider;
  interval: string;
  range: string;
  isFallback: boolean;
  warning: string | null;
}

function round(value: number, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function defaultDisplayRangeForTimeframe(timeframe: string) {
  if (timeframe === "7d" || timeframe === "30d" || timeframe === "90d") {
    return timeframe;
  }

  return "1d";
}

function dashboardOverviewRequest(filters: { timeframe: string; interval?: string; range?: string; limit?: number }) {
  const range = filters.range ?? defaultDisplayRangeForTimeframe(filters.timeframe);
  const rangeDefinition = dashboardRanges[range] ?? dashboardRanges["1d"];
  const interval = filters.interval ?? filters.timeframe;

  return {
    interval,
    range,
    sourceTimeframe: rangeDefinition.sourceTimeframe,
    sourceLimit: Math.min(filters.limit ?? rangeDefinition.sourceLimit, rangeDefinition.sourceLimit),
    expectedCandles: rangeDefinition.sourceLimit,
    rangeChange: true
  };
}

function buildMarketOverview(
  filters: { symbol: string; timeframe: string },
  candles: NewCandle[],
  source: MarketOverviewSource,
  rangeChange = false,
  expectedCandles?: number
): MarketOverviewApi {
  const latest = candles.at(-1);
  const previous = rangeChange ? candles.at(0) : candles.at(-2);
  const previousClose = rangeChange ? previous?.open : previous?.close;
  const periodHigh = candles.length > 0 ? Math.max(...candles.map((candle) => candle.high)) : null;
  const periodLow = candles.length > 0 ? Math.min(...candles.map((candle) => candle.low)) : null;
  const periodVolume =
    candles.length > 0 ? candles.reduce((total, candle) => total + candle.volume, 0) : null;
  const change = latest && previousClose !== undefined ? latest.close - previousClose : null;
  const changePercent = change !== null && previousClose ? (change / previousClose) * 100 : null;
  const updatedAt = latest ? new Date(latest.closeTime).toISOString() : null;
  const durationMs = timeframeDurationsMs[source.interval] ?? 60 * 60 * 1000;
  const ageMs = latest ? Date.now() - latest.closeTime : null;
  const isStale = ageMs === null || ageMs > durationMs * 2.5;
  const missingCandles = expectedCandles !== undefined && candles.length < expectedCandles;
  const warning =
    source.warning ??
    (missingCandles
      ? `Only ${candles.length} of ${expectedCandles} expected candles are available for this ${source.range} range.`
      : null);

  return {
    symbol: filters.symbol,
    timeframe: filters.timeframe,
    interval: source.interval,
    range: source.range,
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
      previousClose: previousClose ?? null,
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
          ? `Latest ${source.interval} candle closed at ${updatedAt}`
          : "No candles are available for this market range"
        : null
    },
    source: {
      ...source,
      warning
    }
  };
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

  return buildMarketOverview(
    filters,
    candles,
    {
      provider: "sqlite",
      interval: filters.timeframe,
      range: filters.timeframe,
      isFallback: false,
      warning: null
    },
    false,
    filters.limit
  );
}

export function getStoredDashboardMarketOverview(
  filters: { symbol: string; timeframe: string; interval?: string; range?: string; limit?: number; fallbackReason?: string },
  db?: Database.Database
): MarketOverviewApi {
  const database = db ?? getDatabase();

  if (!db) {
    initializeDatabase();
  }

  const rangeRequest = dashboardOverviewRequest(filters);
  const candles = getCandlesBySymbolTimeframe(
    database,
    filters.symbol,
    rangeRequest.sourceTimeframe,
    rangeRequest.sourceLimit
  );

  return buildMarketOverview(
    filters,
    candles,
    {
      provider: "sqlite",
      interval: rangeRequest.sourceTimeframe,
      range: rangeRequest.range,
      isFallback: Boolean(filters.fallbackReason),
      warning: filters.fallbackReason ? `Live Binance candles unavailable; using local SQLite data. ${filters.fallbackReason}` : null
    },
    rangeRequest.rangeChange,
    rangeRequest.expectedCandles
  );
}

export async function getLiveMarketOverview(filters: {
  symbol: string;
  timeframe: string;
  interval?: string;
  range?: string;
  limit?: number;
}): Promise<MarketOverviewApi> {
  const liveRequest = dashboardOverviewRequest(filters);
  const result = await fetchBinanceCandles({
    symbol: filters.symbol,
    timeframe: liveRequest.sourceTimeframe,
    limit: liveRequest.sourceLimit
  });

  return buildMarketOverview(
    {
      symbol: filters.symbol,
      timeframe: filters.timeframe
    },
    result.candles,
    {
      provider: "binance_live",
      interval: liveRequest.sourceTimeframe,
      range: liveRequest.range,
      isFallback: false,
      warning: null
    },
    liveRequest.rangeChange,
    liveRequest.expectedCandles
  );
}

export async function getDashboardMarketOverview(filters: {
  symbol: string;
  timeframe: string;
  interval?: string;
  range?: string;
  limit?: number;
}, db?: Database.Database): Promise<MarketOverviewApi> {
  try {
    return await getLiveMarketOverview(filters);
  } catch (error) {
    const fallbackReason = error instanceof Error ? error.message : "Unknown live data error.";

    return getStoredDashboardMarketOverview({
      ...filters,
      fallbackReason
    }, db);
  }
}
