import type { NewCandle } from "@/lib/db/types";

export type MarketDataSource = "binance";

export interface NormalizedCandle extends NewCandle {
  source: MarketDataSource;
}

export interface CandleFetchRequest {
  symbol: string;
  timeframe: string;
  limit: number;
}

export interface CandleFetchResult {
  symbol: string;
  timeframe: string;
  candles: NormalizedCandle[];
}

export interface CollectorError {
  symbol: string;
  timeframe: string;
  message: string;
}
