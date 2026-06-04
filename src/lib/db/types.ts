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

export type UserRole = "user" | "admin";
export type UserStatus = "active" | "disabled";

export interface UserRecord {
  id: number;
  email: string;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewUser {
  email: string;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  emailVerifiedAt?: string | null;
}

export interface SessionRecord {
  id: number;
  userId: number;
  tokenHash: string;
  expiresAt: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SituationOverviewRecord {
  id: number;
  symbol: string;
  timeframe: string;
  accessPlan: string;
  generatedAt: string;
  title: string;
  summary: string;
  bias: string;
  riskLevel: string;
  confidence: string;
  score: number;
  riskScore: number;
  mainDriversJson: string;
  conflictingSignalsJson: string;
  watchConditionsJson: string;
  dataWarningsJson: string;
  changesJson: string;
  sourceWidgetsJson: string;
  metaJson: string;
  createdAt: string;
}

export type NewSituationOverview = Omit<SituationOverviewRecord, "id" | "createdAt">;

export type AlertRuleType =
  | "situation_bias_changed"
  | "risk_level_changed"
  | "watch_condition_appeared"
  | "widget_direction_changed"
  | "score_crossed_threshold";

export type AlertSeverity = "info" | "warning" | "critical";

export interface AlertRuleRecord {
  id: number;
  ruleType: AlertRuleType;
  symbol: string;
  timeframe: string;
  accessPlan: string;
  title: string;
  description: string;
  severity: AlertSeverity;
  isEnabled: boolean;
  widgetId: string | null;
  watchConditionId: string | null;
  thresholdValue: number | null;
  thresholdDirection: "above" | "below" | null;
  createdAt: string;
  updatedAt: string;
}

export type NewAlertRule = Omit<AlertRuleRecord, "id" | "createdAt" | "updatedAt">;

export interface AlertEventRecord {
  id: number;
  ruleId: number;
  symbol: string;
  timeframe: string;
  accessPlan: string;
  triggerKey: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  explanation: string;
  sourceWidget: string | null;
  overviewId: number | null;
  metadataJson: string;
  acknowledgedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NewAlertEvent = Omit<AlertEventRecord, "id" | "createdAt" | "updatedAt" | "acknowledgedAt">;

export interface PortfolioItemRecord {
  id: number;
  symbol: string;
  quantity: number;
  averageCost: number | null;
  quoteCurrency: string;
  label: string | null;
  notes: string | null;
  includeInRisk: boolean;
  createdAt: string;
  updatedAt: string;
}

export type NewPortfolioItem = Omit<PortfolioItemRecord, "id" | "createdAt" | "updatedAt">;

export type StoredLiquidationSide = "long" | "short";
export type LiquidationSide = "long_liquidated" | "short_liquidated";

export interface LiquidationEventRecord {
  id: number;
  eventId: string;
  symbol: string;
  source: string;
  eventTime: number;
  side: LiquidationSide;
  liquidationSide: StoredLiquidationSide;
  orderSide: string;
  price: number;
  quantity: number;
  notionalUsd: number;
  metadataJson: string | null;
  createdAt: string;
}

export type NewLiquidationEvent = Omit<LiquidationEventRecord, "id" | "createdAt" | "liquidationSide">;

export interface DerivativesMetricRecord {
  id: number;
  symbol: string;
  period: string;
  source: string;
  metricTime: number;
  fundingRate: number | null;
  nextFundingTime: number | null;
  markPrice: number | null;
  indexPrice: number | null;
  openInterest: number | null;
  openInterestValue: number | null;
  longShortRatio: number | null;
  longAccount: number | null;
  shortAccount: number | null;
  basis: number | null;
  basisRate: number | null;
  annualizedBasisRate: number | null;
  futuresPrice: number | null;
  metadataJson: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NewDerivativesMetric = Omit<DerivativesMetricRecord, "id" | "createdAt" | "updatedAt">;

export interface DerivativesLatestMetrics {
  symbol: string;
  period: string;
  source: string;
  updatedAt: string | null;
  fundingRate: number | null;
  nextFundingTime: number | null;
  markPrice: number | null;
  indexPrice: number | null;
  openInterest: number | null;
  openInterestValue: number | null;
  openInterestChangePct: number | null;
  longShortRatio: number | null;
  longAccount: number | null;
  shortAccount: number | null;
  basis: number | null;
  basisRate: number | null;
  annualizedBasisRate: number | null;
  futuresPrice: number | null;
  sampleCount: number;
}

export interface LiquidationTimelineBucket {
  fromTime: number;
  toTime: number;
  longLiquidatedUsd: number;
  shortLiquidatedUsd: number;
  totalLiquidatedUsd: number;
  eventCount: number;
}

export interface LiquidationLargestEvent {
  id: number;
  eventId: string;
  symbol: string;
  side: LiquidationSide;
  price: number;
  quantity: number;
  notionalUsd: number;
  timestamp: number;
  source: string;
}

export interface LiquidationSymbolAggregate {
  symbol: string;
  totalLiquidatedUsd: number;
  longLiquidatedUsd: number;
  shortLiquidatedUsd: number;
  eventCount: number;
}
