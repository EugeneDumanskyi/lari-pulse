export interface AppSymbolConfig {
  symbol: string;
  assetType: "crypto";
  baseAsset: string;
  quoteAsset: string;
  source: "binance";
  isActive: boolean;
}

export const defaultSymbols: AppSymbolConfig[] = [
  {
    symbol: "BTCUSDT",
    assetType: "crypto",
    baseAsset: "BTC",
    quoteAsset: "USDT",
    source: "binance",
    isActive: true
  },
  {
    symbol: "ETHUSDT",
    assetType: "crypto",
    baseAsset: "ETH",
    quoteAsset: "USDT",
    source: "binance",
    isActive: true
  },
  {
    symbol: "SOLUSDT",
    assetType: "crypto",
    baseAsset: "SOL",
    quoteAsset: "USDT",
    source: "binance",
    isActive: true
  }
];
