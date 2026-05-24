export const assetTypes = [
  "crypto",
  "commodity",
  "index",
  "fx",
  "yield",
  "volatility",
  "macro"
] as const;

export type AssetType = (typeof assetTypes)[number];

export const marketDataSources = [
  "binance",
  "stooq",
  "yahoo",
  "fred",
  "alpha_vantage",
  "twelve_data",
  "manual"
] as const;

export type MarketDataSource = (typeof marketDataSources)[number];
