import type { SourceRef, WidgetSeverity } from "@/lib/widgets/types";
import type { SourceRunStatus } from "@/lib/db/types";
import type { AssetType, MarketDataSource } from "@/lib/config/marketTypes";
import type { AccessPlan } from "@/lib/auth/access";
import type { WidgetGroup, WidgetPlanTier } from "@/lib/widgets/catalog";

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
  assetType: AssetType;
  baseAsset: string;
  quoteAsset: string;
  source: MarketDataSource;
  displayName: string | null;
  providerSymbol: string | null;
  priceUnit: string | null;
  isActive: boolean;
  isLocked: boolean;
}

export interface AuthSessionApi {
  isAdmin: boolean;
  plan: AccessPlan;
  username: string | null;
  userId: number | null;
  email: string | null;
  role: "user" | "admin" | "anonymous";
  accessibleSymbols: string[];
  lockedSymbols: string[];
  visibleWidgetIds: string[];
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

export interface WidgetCatalogItemApi {
  widgetId: string;
  title: string;
  group: WidgetGroup;
  planTier: WidgetPlanTier;
  defaultEnabled: boolean;
  priority: number;
  category: string;
  iconKey: string;
  description: string;
  isAvailable: boolean;
  isLocked: boolean;
  isEnabled: boolean;
}

export interface WidgetSettingsApi {
  plan: AccessPlan;
  canEdit: boolean;
  enabledWidgetIds: string[];
  catalog: WidgetCatalogItemApi[];
  updatedAt: string;
}

export interface CrossMarketAssetStatusApi {
  symbol: string;
  displayName: string;
  assetType: AssetType;
  source: MarketDataSource;
  latestValue: number | null;
  changePercent: number | null;
  candleCount: number;
  updatedAt: string | null;
  isMissing: boolean;
  isStale: boolean;
}

export interface CrossMarketCorrelationApi {
  id: string;
  label: string;
  leftSymbol: string;
  rightSymbol: string;
  timeframe: string;
  latestCorrelation: number | null;
  observations: number;
  divergencePercent: number | null;
  warnings: string[];
  updatedAt: string | null;
}

export interface CrossMarketWidgetsApi {
  timeframe: string;
  results: WidgetResultApi[];
  assetStatuses: CrossMarketAssetStatusApi[];
  correlations: CrossMarketCorrelationApi[];
  warnings: string[];
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
  interval: string;
  range: string;
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
  source: {
    provider: "binance_live" | "sqlite";
    interval: string;
    range: string;
    isFallback: boolean;
    warning: string | null;
  };
}

export interface MarketSummaryApi {
  symbol: string;
  displayName: string;
  assetType: AssetType;
  source: MarketDataSource;
  group: string;
  timeframe: string;
  priceUnit: string | null;
  providerSymbol: string | null;
  latestValue: number | null;
  changePercent: number | null;
  candleCount: number;
  updatedAt: string | null;
  isStale: boolean;
  isLocked: boolean;
  sourceNote: string | null;
}

export interface MarketsApi {
  markets: MarketSummaryApi[];
  count: number;
  session: AuthSessionApi;
  updatedAt: string;
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
    phase2Enabled: boolean;
    phase2IntervalSeconds: number;
    lastPhase2RunAt: string | null;
    lastPhase2Status: "ok" | "partial" | "error" | "skipped" | null;
  };
  liquidity: {
    enabled: boolean;
    started: boolean;
    liquidationsRetentionHours: number;
    latestRetentionPruneAt: string | null;
    latestRetentionPrunedEvents: number | null;
    liquidationStream: {
      started: boolean;
      connected: boolean;
      reconnecting: boolean;
      url: string;
      symbols: string[];
      messagesReceived: number;
      eventsReceived: number;
      eventsStored: number;
      lastMessageAt: string | null;
      lastError: string | null;
      reconnectAttempts: number;
      sourceRunId: number | null;
    };
    latestLiquidationStreamRun: SourceRunApi | null;
  };
  collection: {
    configuredSymbols: string[];
    configuredTimeframes: string[];
    latestBinanceRun: SourceRunApi | null;
    latestFredRun: SourceRunApi | null;
    latestSchedulerRun: SourceRunApi | null;
    recentRuns: SourceRunApi[];
    hasCollectorFailure: boolean;
    warningMessages: string[];
  };
}

export type {
  SituationBias,
  SituationRiskLevel,
  SituationConfidence,
  SituationOverview,
  SituationDriver,
  SituationWatchCondition,
  SituationDataWarning,
  SituationChange,
  SituationSourceWidget,
  SituationOverviewHistoryItem
} from "@/lib/services/situationOverview/situationOverview.types";

export type {
  AlertRuleApi,
  AlertEventApi,
  AlertRuleInput
} from "@/lib/services/alertService";

export type {
  OpportunityRadarItem,
  OpportunityRadarResponse
} from "@/lib/services/opportunityRadarService";

export type {
  ChartOverlay,
  ChartOverlaysResponse
} from "@/lib/services/chartOverlayService";

export type {
  PortfolioContextApi,
  PortfolioItemApi,
  PortfolioItemInput,
  PortfolioSituationApi
} from "@/lib/services/portfolioContextService";
