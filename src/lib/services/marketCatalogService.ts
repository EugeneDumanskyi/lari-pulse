import type Database from "better-sqlite3";
import type { MarketsApi, MarketSummaryApi } from "@/lib/api/types";
import type { AuthSession } from "@/lib/auth/access";
import { authSessionApi, canAccessSymbol } from "@/lib/auth/access";
import { defaultSymbols, phase2Symbols, type AppSymbolConfig } from "@/lib/config/symbols";
import { getDatabase } from "@/lib/db/client";
import { initializeDatabase } from "@/lib/db/initialize";
import { getMarketOverview } from "./marketDataService";

const marketConfigs = [...defaultSymbols, ...phase2Symbols];
const marketConfigBySymbol = new Map(marketConfigs.map((config) => [config.symbol, config]));

function defaultTimeframeFor(config: AppSymbolConfig) {
  return config.source === "binance" ? "1h" : "1d";
}

function marketGroup(config: AppSymbolConfig) {
  if (config.assetType === "crypto") {
    return "Crypto";
  }

  if (config.assetType === "index" || config.assetType === "volatility") {
    return "Equity / Index";
  }

  if (config.assetType === "commodity") {
    return "Commodity";
  }

  if (config.assetType === "fx" || config.assetType === "yield") {
    return "FX / Yield";
  }

  return "Macro";
}

function sourceNote(config: AppSymbolConfig) {
  const note = config.metadata?.notes;

  if (typeof note === "string") {
    return note;
  }

  if (config.source === "fred") {
    return "Daily FRED-backed normalized market series.";
  }

  if (config.source === "binance") {
    return "Binance OHLCV candles normalized into local SQLite.";
  }

  return null;
}

function marketSummary(config: AppSymbolConfig, session: AuthSession, db: Database.Database): MarketSummaryApi {
  const timeframe = defaultTimeframeFor(config);
  const overview = getMarketOverview({ symbol: config.symbol, timeframe, limit: 160 }, db);

  return {
    symbol: config.symbol,
    displayName: config.displayName ?? config.symbol,
    assetType: config.assetType,
    source: config.source,
    group: marketGroup(config),
    timeframe,
    priceUnit: config.priceUnit ?? config.quoteAsset,
    providerSymbol: config.providerSymbol ?? config.symbol,
    latestValue: overview.metrics.latestPrice,
    changePercent: overview.metrics.changePercent,
    candleCount: overview.metrics.candleCount,
    updatedAt: overview.metrics.updatedAt,
    isStale: overview.metrics.isStale,
    isLocked: !canAccessSymbol(session, config.symbol),
    sourceNote: sourceNote(config)
  };
}

export function getMarkets(session: AuthSession, db?: Database.Database): MarketsApi {
  if (!db) {
    initializeDatabase();
  }

  const database = db ?? getDatabase();
  const markets = marketConfigs.map((config) => marketSummary(config, session, database));

  return {
    markets,
    count: markets.length,
    session: authSessionApi(session),
    updatedAt: new Date().toISOString()
  };
}

export function getConfiguredMarket(symbol: string) {
  return marketConfigBySymbol.get(symbol.trim().toUpperCase()) ?? null;
}

export function getDefaultMarketTimeframe(symbol: string) {
  const config = getConfiguredMarket(symbol);

  return config ? defaultTimeframeFor(config) : null;
}
