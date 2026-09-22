import type { AlertSeverity } from "@/lib/db/types";
import type {
  SituationBias,
  SituationConfidence,
  SituationDriver,
  SituationRiskLevel,
  SituationWatchCondition
} from "@/lib/services/situationOverview/situationOverview.types";

export type InsightRange = "1d" | "7d" | "30d" | "90d";

export type InsightSectionId =
  | "window-coverage"
  | "bias-transitions"
  | "risk-transitions"
  | "recurring-drivers"
  | "persistent-conflicts"
  | "watch-conditions"
  | "data-coverage"
  | "alert-activity";

export type InsightSectionCategory = "market" | "personal";

export type InsightSectionCoverage = "reported" | "insufficient" | "empty" | "omitted";

export interface InsightWindow {
  from: string;
  to: string;
}

export interface InsightSourceRows {
  table: "situation_overviews" | "alert_events";
  ids: number[];
}

export interface InsightLine {
  id: string;
  text: string;
  values: Record<string, string | number>;
  sourceRows: InsightSourceRows[];
}

export interface InsightSection {
  id: InsightSectionId;
  title: string;
  category: InsightSectionCategory;
  coverage: InsightSectionCoverage;
  lines: InsightLine[];
}

export interface InsightsResponse {
  symbol: string;
  timeframe: string;
  range: InsightRange;
  requestedWindow: InsightWindow;
  coveredWindow: InsightWindow | null;
  snapshotCount: number;
  truncated: boolean;
  generatedAt: string;
  sections: InsightSection[];
}

/**
 * The two row shapes the pure layer consumes. Both are narrower than the
 * stored record on purpose: a field that reaches `buildInsightSections` is a
 * field some section reads.
 */
export interface InsightSnapshot {
  id: number;
  generatedAt: string;
  bias: SituationBias;
  riskLevel: SituationRiskLevel;
  confidence: SituationConfidence;
  mainDrivers: SituationDriver[];
  conflictingSignals: SituationDriver[];
  watchConditions: SituationWatchCondition[];
  meta: {
    missingInputs: string[];
    staleInputs: string[];
    usedFallbacks: string[];
    isPartial: boolean;
  };
}

export interface InsightAlertEvent {
  id: number;
  createdAt: string;
  severity: AlertSeverity;
  title: string;
  symbol: string;
  timeframe: string;
  acknowledged: boolean;
}

export interface BuildInsightSectionsInput {
  range: InsightRange;
  requestedWindow: InsightWindow;
  snapshots: InsightSnapshot[];
  snapshotsTruncated: boolean;
  snapshotsLeftOut: number;
  alerts: InsightAlertEvent[] | null;
  alertsTruncated: boolean;
  alertsLeftOut: number;
}
