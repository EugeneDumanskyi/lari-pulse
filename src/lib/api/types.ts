import type { SourceRef, WidgetSeverity } from "@/lib/widgets/types";
import type { SourceRunStatus } from "@/lib/db/types";

export interface ApiEnvelope<T> {
  status: "ok";
  data: T;
}

export interface ApiErrorEnvelope {
  status: "error";
  message: string;
}

export interface SymbolApi {
  symbol: string;
  assetType: string;
  baseAsset: string;
  quoteAsset: string;
  source: string;
  isActive: boolean;
}

export interface WidgetResultApi {
  id: number;
  widgetId: string;
  symbol: string | null;
  timeframe: string | null;
  score: number;
  direction: string;
  confidence: number;
  severity: WidgetSeverity;
  summary: string;
  details: Record<string, unknown>;
  sources: SourceRef[];
  updatedAt: string;
}

export interface MarketCandleApi {
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketOverviewApi {
  symbol: string;
  timeframe: string;
  candles: MarketCandleApi[];
  metrics: {
    latestPrice: number | null;
    previousClose: number | null;
    change: number | null;
    changePercent: number | null;
    periodHigh: number | null;
    periodLow: number | null;
    periodVolume: number | null;
    candleCount: number;
    updatedAt: string | null;
    isStale: boolean;
    staleReason: string | null;
  };
}

export interface SourceRunApi {
  id: number;
  source: string;
  collectorId: string;
  status: SourceRunStatus;
  startedAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
}

export interface RuntimeStatusApi {
  scheduler: {
    enabled: boolean;
    started: boolean;
    running: boolean;
    intervalSeconds: number;
    lastRunAt: string | null;
    lastStatus: "ok" | "partial" | "error" | "skipped" | null;
  };
  collection: {
    configuredSymbols: string[];
    configuredTimeframes: string[];
    latestBinanceRun: SourceRunApi | null;
    latestSchedulerRun: SourceRunApi | null;
    recentRuns: SourceRunApi[];
    hasCollectorFailure: boolean;
    warningMessages: string[];
  };
}
