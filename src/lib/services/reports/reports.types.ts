import type { WidgetResultApi } from "@/lib/api/types";
import type { AlertEventApi } from "@/lib/services/alertService";
import type { InsightRange, InsightWindow, InsightsResponse } from "@/lib/services/insights/insights.types";
import type { OpportunityRadarResponse } from "@/lib/services/opportunityRadarService";
import type { PortfolioContextApi } from "@/lib/services/portfolioContextService";
import type { SituationOverview } from "@/lib/services/situationOverview/situationOverview.types";

export type ReportFormat = "markdown" | "json" | "csv";

export type ReportSectionId =
  | "situation"
  | "widgets"
  | "insights"
  | "radar"
  | "portfolio"
  | "alerts";

export type ReportSectionCategory = "market" | "personal";

export type ReportSectionStatus = "included" | "empty" | "omitted";

export interface ReportScopePair {
  symbol: string;
  timeframe: string;
}

export interface ReportScope {
  symbols: string[];
  timeframes: string[];
  pairs: ReportScopePair[];
}

export interface ReportFact {
  key: string;
  label: string;
  /**
   * Always a string, never a number, a date or an array. Every format writes
   * it as it stands, which is what keeps the three serializers free of
   * formatting rules and one number rendered identically in all three.
   */
  value: string;
}

export interface ReportEntry {
  /** `null` on a report-wide entry — radar, portfolio and alerts. */
  scope: ReportScopePair | null;
  facts: ReportFact[];
}

export interface ReportSection {
  id: ReportSectionId;
  title: string;
  category: ReportSectionCategory;
  status: ReportSectionStatus;
  note: string | null;
  entries: ReportEntry[];
}

export interface ReportDocument {
  generatedAt: string;
  range: InsightRange;
  window: InsightWindow;
  scope: ReportScope;
  disclaimer: string;
  header: ReportFact[];
  sections: ReportSection[];
}

export interface GeneratedReport {
  document: ReportDocument;
  format: ReportFormat;
  body: string;
  filename: string;
  contentType: string;
}

/**
 * The composition input. Each field is the material one section needs, and
 * `null` means the section is in `sections` but the session may not read it —
 * a section not requested at all is absent from `sections` instead.
 *
 * Every carried type is the composing service's own export rather than a
 * narrowed copy, so a field changing there fails this composition at compile
 * time, which is exactly the failure the compiler should catch.
 */
export interface BuildReportDocumentInput {
  now: Date;
  range: InsightRange;
  window: InsightWindow;
  scope: ReportScope;
  sections: ReportSectionId[];
  situation: Array<{ pair: ReportScopePair; overview: SituationOverview }> | null;
  widgets: Array<{ pair: ReportScopePair; results: WidgetResultApi[] }> | null;
  insights: Array<{ pair: ReportScopePair; response: InsightsResponse }> | null;
  radar: OpportunityRadarResponse | null;
  portfolio: PortfolioContextApi | null;
  /**
   * Already normalised to ISO and already filtered to the window, so
   * `buildReportDocument` never parses a timestamp or compares one to a bound.
   * `truncated` is true when the read came back at exactly
   * `maxReportAlertEvents`.
   */
  alerts: { events: AlertEventApi[]; truncated: boolean } | null;
}
