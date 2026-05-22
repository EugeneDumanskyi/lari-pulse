import type { CandleRecord } from "@/lib/db/types";

export type WidgetSeverity = "low" | "medium" | "high";

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
  marketContext?: Record<string, unknown>;
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
