import type { AssetType, MarketDataSource } from "./marketTypes";

export interface AppSymbolConfig {
  symbol: string;
  assetType: AssetType;
  baseAsset: string;
  quoteAsset: string;
  source: MarketDataSource;
  displayName?: string;
  providerSymbol?: string;
  priceUnit?: string;
  metadata?: Record<string, unknown>;
  isActive: boolean;
}

export const defaultSymbols: AppSymbolConfig[] = [
  {
    symbol: "BTCUSDT",
    assetType: "crypto",
    baseAsset: "BTC",
    quoteAsset: "USDT",
    source: "binance",
    displayName: "Bitcoin",
    providerSymbol: "BTCUSDT",
    priceUnit: "USDT",
    isActive: true
  },
  {
    symbol: "ETHUSDT",
    assetType: "crypto",
    baseAsset: "ETH",
    quoteAsset: "USDT",
    source: "binance",
    displayName: "Ethereum",
    providerSymbol: "ETHUSDT",
    priceUnit: "USDT",
    isActive: true
  },
  {
    symbol: "SOLUSDT",
    assetType: "crypto",
    baseAsset: "SOL",
    quoteAsset: "USDT",
    source: "binance",
    displayName: "Solana",
    providerSymbol: "SOLUSDT",
    priceUnit: "USDT",
    isActive: true
  }
];

export const phase2Symbols: AppSymbolConfig[] = [
  {
    symbol: "XAUUSD",
    assetType: "commodity",
    baseAsset: "XAU",
    quoteAsset: "USD",
    source: "fred",
    displayName: "Gold Price Index",
    providerSymbol: "NASDAQQGLDI",
    priceUnit: "index_points",
    metadata: {
      phase: "phase2",
      provider: "FRED",
      providerName: "Nasdaq via FRED",
      fredSeriesId: "NASDAQQGLDI",
      sourceType: "daily_index_proxy",
      notes: "Gold proxy from FRED/Nasdaq daily index data; not spot XAU/USD."
    },
    isActive: false
  },
  {
    symbol: "WTI",
    assetType: "commodity",
    baseAsset: "WTI",
    quoteAsset: "USD",
    source: "fred",
    displayName: "WTI Crude Oil",
    providerSymbol: "DCOILWTICO",
    priceUnit: "USD_PER_BARREL",
    metadata: {
      phase: "phase2",
      provider: "FRED",
      providerName: "U.S. Energy Information Administration via FRED",
      fredSeriesId: "DCOILWTICO",
      sourceType: "daily_spot_price"
    },
    isActive: false
  },
  {
    symbol: "NASDAQ100",
    assetType: "index",
    baseAsset: "NASDAQ100",
    quoteAsset: "POINTS",
    source: "fred",
    displayName: "Nasdaq 100",
    providerSymbol: "NASDAQ100",
    priceUnit: "index_points",
    metadata: {
      phase: "phase2",
      provider: "FRED",
      providerName: "Nasdaq via FRED",
      fredSeriesId: "NASDAQ100",
      sourceType: "daily_index"
    },
    isActive: false
  },
  {
    symbol: "SPX",
    assetType: "index",
    baseAsset: "SPX",
    quoteAsset: "POINTS",
    source: "fred",
    displayName: "S&P 500",
    providerSymbol: "SP500",
    priceUnit: "index_points",
    metadata: {
      phase: "phase2",
      provider: "FRED",
      providerName: "S&P Dow Jones Indices via FRED",
      fredSeriesId: "SP500",
      sourceType: "daily_index"
    },
    isActive: false
  },
  {
    symbol: "DXY",
    assetType: "fx",
    baseAsset: "USD",
    quoteAsset: "BROAD_INDEX",
    source: "fred",
    displayName: "US Dollar Index Proxy",
    providerSymbol: "DTWEXBGS",
    priceUnit: "index_points",
    metadata: {
      phase: "phase2",
      provider: "FRED",
      providerName: "Federal Reserve via FRED",
      fredSeriesId: "DTWEXBGS",
      sourceType: "daily_broad_dollar_index_proxy",
      notes: "Broad U.S. dollar index proxy; not ICE DXY spot data."
    },
    isActive: false
  },
  {
    symbol: "US10Y",
    assetType: "yield",
    baseAsset: "US10Y",
    quoteAsset: "PERCENT",
    source: "fred",
    displayName: "US 10-Year Treasury Yield",
    providerSymbol: "DGS10",
    priceUnit: "percent",
    metadata: {
      phase: "phase2",
      provider: "FRED",
      providerName: "Board of Governors via FRED",
      fredSeriesId: "DGS10",
      sourceType: "daily_yield"
    },
    isActive: false
  },
  {
    symbol: "VIX",
    assetType: "volatility",
    baseAsset: "VIX",
    quoteAsset: "POINTS",
    source: "fred",
    displayName: "CBOE Volatility Index",
    providerSymbol: "VIXCLS",
    priceUnit: "index_points",
    metadata: {
      phase: "phase2",
      provider: "FRED",
      providerName: "CBOE via FRED",
      fredSeriesId: "VIXCLS",
      sourceType: "daily_volatility_index"
    },
    isActive: false
  }
];

export const phase2StarterSymbols = phase2Symbols;
