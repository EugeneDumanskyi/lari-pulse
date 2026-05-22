export interface SymbolRecord {
  id: number;
  symbol: string;
  assetType: string;
  baseAsset: string;
  quoteAsset: string;
  source: string;
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
