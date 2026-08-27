import type {
  SourceRef,
  WidgetContext,
  WidgetLiquidationSummary,
  WidgetSeverity
} from "../types";
import { round } from "../crypto/helpers";

export const LIQUIDATION_EVENT_STREAM_STALE_MS = 10 * 60 * 1000;

export function moneyUsd(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round(value);
}

export function severityFromDirectionalScore(score: number): WidgetSeverity {
  if (score >= 70 || score <= 30) {
    return "high";
  }

  if (score >= 58 || score <= 42) {
    return "medium";
  }

  return "low";
}

export function ageMs(isoTimestamp: string | null | undefined, now: Date) {
  if (!isoTimestamp) {
    return Number.POSITIVE_INFINITY;
  }

  const parsed = Date.parse(isoTimestamp);

  return Number.isFinite(parsed) ? Math.max(0, now.getTime() - parsed) : Number.POSITIVE_INFINITY;
}

export function ageMinutes(isoTimestamp: string | null | undefined, now: Date) {
  const age = ageMs(isoTimestamp, now);

  return Number.isFinite(age) ? round(age / 60_000, 1) : null;
}

export function summarySource(summary: WidgetLiquidationSummary | null, context: WidgetContext): SourceRef {
  return {
    source: summary?.source ?? "binance_futures",
    type: "liquidation_events",
    symbol: context.symbol,
    timeframe: context.timeframe,
    updatedAt: summary ? new Date(summary.toTime).toISOString() : context.now.toISOString()
  };
}

export function notionalShare(value: number, total: number) {
  return total > 0 ? value / total : 0;
}
