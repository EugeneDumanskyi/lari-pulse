import type { WidgetResultApi, MarketOverviewApi } from "@/lib/api/types";

export type SituationBias =
  | "strong_bullish"
  | "bullish"
  | "neutral"
  | "bearish"
  | "strong_bearish"
  | "mixed"
  | "unknown";

export type SituationRiskLevel = "low" | "moderate" | "elevated" | "high" | "extreme" | "unknown";

export type SituationConfidence = "low" | "medium" | "high";

export type SituationDriverDirection =
  | "bullish"
  | "bearish"
  | "neutral"
  | "mixed"
  | "risk_on"
  | "risk_off"
  | "unknown";

export type SituationDriverStrength = "low" | "medium" | "high";

export interface SituationDriver {
  id: string;
  label: string;
  direction: SituationDriverDirection;
  strength: SituationDriverStrength;
  explanation: string;
  sourceWidget?: string;
}

export interface SituationWatchCondition {
  id: string;
  label: string;
  condition: string;
  implication: string;
  severity: "info" | "warning" | "critical";
  sourceWidget?: string;
}

export interface SituationDataWarning {
  id: string;
  label: string;
  explanation: string;
  severity: "info" | "warning" | "critical";
  sourceWidget?: string;
}

export interface SituationChange {
  id: string;
  label: string;
  previous: string;
  current: string;
  explanation: string;
}

export interface SituationSourceWidget {
  id: string;
  name: string;
  status: "used" | "missing" | "stale" | "error" | "fallback";
  contribution: "primary" | "secondary" | "context";
}

export interface SituationOverview {
  symbol: string;
  timeframe: string;
  generatedAt: string;
  title: string;
  summary: string;
  bias: SituationBias;
  riskLevel: SituationRiskLevel;
  confidence: SituationConfidence;
  score: number;
  riskScore: number;
  mainDrivers: SituationDriver[];
  conflictingSignals: SituationDriver[];
  watchConditions: SituationWatchCondition[];
  dataWarnings: SituationDataWarning[];
  changedSincePrevious?: SituationChange[];
  sourceWidgets: SituationSourceWidget[];
  meta: {
    missingInputs: string[];
    staleInputs: string[];
    usedFallbacks: string[];
    isPartial: boolean;
  };
}

export interface SituationOverviewBuildInput {
  symbol: string;
  timeframe: string;
  generatedAt?: Date;
  widgets: WidgetResultApi[];
  crossMarketWidgets?: WidgetResultApi[];
  marketOverview?: MarketOverviewApi | null;
  expectedWidgetIds?: string[];
  previousOverview?: SituationOverview | null;
}

