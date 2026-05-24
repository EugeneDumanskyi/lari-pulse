import type { AssetType, MarketDataSource } from "@/lib/config/marketTypes";

export interface SymbolRecord {
  id: number;
  symbol: string;
  assetType: AssetType;
  baseAsset: string;
  quoteAsset: string;
  source: MarketDataSource;
  displayName: string | null;
  providerSymbol: string | null;
  priceUnit: string | null;
  metadataJson: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CandleRecord {
  id: number;
  symbol: string;
  timeframe: string;
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source: string;
  createdAt: string;
}

export type NewCandle = Omit<CandleRecord, "id" | "createdAt">;

export interface WidgetResultRow {
  id: number;
  widgetId: string;
  symbol: string | null;
  timeframe: string | null;
  score: number;
  direction: string;
  confidence: number;
  severity: "low" | "medium" | "high";
  summary: string;
  detailsJson: string;
  sourcesJson: string;
  createdAt: string;
}

export interface NewWidgetResult {
  widgetId: string;
  symbol?: string;
  timeframe?: string;
  score: number;
  direction: string;
  confidence: number;
  severity: "low" | "medium" | "high";
  summary: string;
  detailsJson: string;
  sourcesJson: string;
  createdAt?: string;
}

export type SourceRunStatus = "running" | "success" | "failure";

export interface SourceRunRecord {
  id: number;
  source: string;
  collectorId: string;
  status: SourceRunStatus;
  startedAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
  metadataJson: string | null;
}

export interface NewSourceRun {
  source: string;
  collectorId: string;
  status: SourceRunStatus;
  startedAt?: string;
  finishedAt?: string | null;
  errorMessage?: string | null;
  metadataJson?: string | null;
}

export interface WidgetSettingRecord {
  id: number;
  widgetId: string;
  isEnabled: boolean;
  updatedAt: string;
}

export interface NewWidgetSetting {
  widgetId: string;
  isEnabled: boolean;
}
