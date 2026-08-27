import type { CorrelationPairConfig } from "./types";

export const crossMarketCorrelationPairs: CorrelationPairConfig[] = [
  {
    id: "btc_nasdaq100",
    leftSymbol: "BTCUSDT",
    rightSymbol: "NASDAQ100",
    label: "BTC vs Nasdaq 100"
  },
  {
    id: "btc_dxy",
    leftSymbol: "BTCUSDT",
    rightSymbol: "DXY",
    label: "BTC vs DXY"
  },
  {
    id: "eth_nasdaq100",
    leftSymbol: "ETHUSDT",
    rightSymbol: "NASDAQ100",
    label: "ETH vs Nasdaq 100"
  },
  {
    id: "sol_nasdaq100",
    leftSymbol: "SOLUSDT",
    rightSymbol: "NASDAQ100",
    label: "SOL vs Nasdaq 100"
  },
  {
    id: "gold_dxy",
    leftSymbol: "XAUUSD",
    rightSymbol: "DXY",
    label: "Gold vs DXY"
  },
  {
    id: "gold_us10y",
    leftSymbol: "XAUUSD",
    rightSymbol: "US10Y",
    label: "Gold vs US10Y"
  },
  {
    id: "oil_us10y",
    leftSymbol: "WTI",
    rightSymbol: "US10Y",
    label: "Oil vs US10Y"
  },
  {
    id: "nasdaq100_us10y",
    leftSymbol: "NASDAQ100",
    rightSymbol: "US10Y",
    label: "Nasdaq 100 vs US10Y"
  }
];
