import type {
  CandleRecord,
  LiquidationLargestEvent,
  LiquidationSymbolAggregate,
  LiquidationTimelineBucket
} from "@/lib/db/types";
import type { CorrelationPairResult } from "@/lib/correlations/types";

export type WidgetSeverity = "low" | "medium" | "high";

export type MarketRegimeBias =
  | "risk_on"
  | "risk_off_pressure"
  | "mixed"
  | "transitioning"
  | "unstable"
  | "neutral";

export interface MarketRegimeHint {
  id: string;
  bias: MarketRegimeBias;
  confidence: number;
  summary: string;
  drivers: string[];
  updatedAt: string;
}

export interface WidgetLiquidationSummary {
  symbol: string;
  source: string;
  timeframe: string;
  fromTime: number;
  toTime: number;
  longCount: number;
  shortCount: number;
  longNotionalUsd: number;
  shortNotionalUsd: number;
  totalNotionalUsd: number;
  longLiquidatedUsd: number;
  shortLiquidatedUsd: number;
  totalLiquidatedUsd: number;
  longShortImbalance: number;
  eventCount: number;
  largestLiquidation: LiquidationLargestEvent | null;
  topSymbolsByLiquidation: LiquidationSymbolAggregate[];
  timeline: LiquidationTimelineBucket[];
  longShare: number;
  shortShare: number;
  netPressure: "long_liquidations" | "short_liquidations" | "balanced" | string;
  collector?: {
    started: boolean;
    connected: boolean;
    reconnecting: boolean;
    lastError: string | null;
    messagesReceived: number;
    eventsReceived: number;
    eventsStored: number;
    sourceRunId: number | null;
  };
  storageError?: string;
}

export interface WidgetLiquidityContext {
  liquidationSummaries?: Record<string, Record<string, WidgetLiquidationSummary | undefined>>;
}

export interface WidgetMarketContext {
  timeframeCandles?: Record<string, CandleRecord[]>;
  assetCandles?: Record<string, Record<string, CandleRecord[]>>;
  correlations?: CorrelationPairResult[];
  regimeHints?: MarketRegimeHint[];
  liquidity?: WidgetLiquidityContext;
  latestCandleUpdatedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface SourceRef {
  source: string;
  type: string;
  symbol?: string;
  timeframe?: string;
  updatedAt?: string;
}

export interface WidgetResult {
  widgetId: string;
  symbol?: string;
  timeframe?: string;
  score: number;
  direction: string;
  confidence: number;
  severity: WidgetSeverity;
  summary: string;
  details: Record<string, unknown>;
  sources: SourceRef[];
  updatedAt: string;
}

export interface WidgetContext {
  symbol?: string;
  timeframe?: string;
  candles?: CandleRecord[];
  indicators?: Record<string, unknown>;
  marketContext?: WidgetMarketContext;
  now: Date;
}

export interface WidgetEngine {
  id: string;
  name: string;
  description: string;
  requiredInputs: string[];
  run(context: WidgetContext): Promise<WidgetResult>;
}

export interface WidgetRunSuccess {
  widgetId: string;
  status: "success";
  result: WidgetResult;
  savedRowId?: number;
}

export interface WidgetRunFailure {
  widgetId: string;
  status: "failure";
  error: string;
}

export type WidgetRunOutcome = WidgetRunSuccess | WidgetRunFailure;
