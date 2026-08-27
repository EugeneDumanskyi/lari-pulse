import { getLiquidationSummary } from "../marketContext";
import type { WidgetEngine } from "../types";
import { clamp, round } from "../crypto/helpers";
import {
  LIQUIDATION_EVENT_STREAM_STALE_MS,
  ageMinutes,
  moneyUsd,
  notionalShare,
  severityFromDirectionalScore,
  summarySource
} from "./helpers";

export const liquidationsWidget: WidgetEngine = {
  id: "liquidations",
  name: "Liquidations",
  description: "Summarizes observed long and short forced-order liquidations for the selected interval.",
  requiredInputs: ["marketContext.liquidity.liquidationSummaries"],
  async run(context) {
    const symbol = context.symbol ?? "BTCUSDT";
    const timeframe = context.timeframe ?? "1h";
    const summary = getLiquidationSummary(context.marketContext, symbol, timeframe);

    if (!summary) {
      return {
        widgetId: this.id,
        symbol: context.symbol,
        timeframe: context.timeframe,
        score: 50,
        direction: "unknown",
        confidence: 0.18,
        severity: "low",
        summary: `${symbol} liquidation event data is not available for ${timeframe}.`,
        details: {
          reason: "No observed liquidation-event summary",
          expectedSource: "Binance USD-M Futures liquidation stream",
          limitation: "The stream only observes events while the app is connected."
        },
        sources: [summarySource(null, context)],
        updatedAt: context.now.toISOString()
      };
    }

    if (summary.storageError) {
      return {
        widgetId: this.id,
        symbol: context.symbol,
        timeframe: context.timeframe,
        score: 50,
        direction: "storage_error",
        confidence: 0.12,
        severity: "high",
        summary: `${symbol} stored liquidation events cannot be read right now.`,
        details: {
          reason: "Storage error while reading local liquidation history",
          error: summary.storageError,
          expectedSource: "local liquidation_events table",
          limitation: "Binance cannot backfill missed liquidation events; local history starts when the collector is running."
        },
        sources: [summarySource(summary, context)],
        updatedAt: context.now.toISOString()
      };
    }

    const shortNotionalShare = notionalShare(summary.shortLiquidatedUsd, summary.totalLiquidatedUsd);
    const longNotionalShare = notionalShare(summary.longLiquidatedUsd, summary.totalLiquidatedUsd);
    const countTotal = summary.eventCount;
    const score = Math.round(clamp(50 + (shortNotionalShare - longNotionalShare) * 42, 0, 100));
    const collectorState = summary.collector;
    const collectorHasError = Boolean(collectorState?.lastError);
    const collectorDisconnected = Boolean(collectorState && (!collectorState.started || !collectorState.connected));
    const direction =
      collectorHasError
        ? "collector_error"
        : collectorDisconnected
          ? "collector_disconnected"
          : summary.totalLiquidatedUsd <= 0
            ? "collecting_from_now"
            : score >= 58
              ? "short_liquidations_dominant"
              : score <= 42
                ? "long_liquidations_dominant"
                : "balanced";
    const streamAgeMs = context.now.getTime() - summary.toTime;
    const isStale = streamAgeMs > LIQUIDATION_EVENT_STREAM_STALE_MS;
    const activityConfidence = clamp(Math.log10(Math.max(summary.totalNotionalUsd, 1)) / 10, 0.18, 0.52);
    const countConfidence = clamp(countTotal / 40, 0, 0.18);
    const confidence = round(clamp(0.24 + activityConfidence + countConfidence - (isStale ? 0.15 : 0), 0.18, 0.84), 2);

    return {
      widgetId: this.id,
      symbol: context.symbol,
      timeframe: context.timeframe,
      score,
      direction,
      confidence,
      severity: severityFromDirectionalScore(score),
      summary:
        direction === "collector_error"
          ? `${symbol} liquidation collector reported an error; stored history may be incomplete.`
          : direction === "collector_disconnected"
            ? `${symbol} liquidation collector is disconnected; stored history may be stale or incomplete.`
            : direction === "collecting_from_now"
              ? `${symbol} has no stored Binance liquidation events in the selected ${timeframe} window; local history is collecting from now.`
          : direction === "short_liquidations_dominant"
            ? `${symbol} saw more short-liquidation notional, showing upside squeeze activity in the selected ${timeframe} window.`
            : direction === "long_liquidations_dominant"
              ? `${symbol} saw more long-liquidation notional, showing downside flush activity in the selected ${timeframe} window.`
              : `${symbol} liquidation flow is balanced across longs and shorts in the selected ${timeframe} window.`,
      details: {
        interval: timeframe,
        from: new Date(summary.fromTime).toISOString(),
        to: new Date(summary.toTime).toISOString(),
        ageMinutes: ageMinutes(new Date(summary.toTime).toISOString(), context.now),
        isStale,
        longLiquidationCount: summary.longCount,
        shortLiquidationCount: summary.shortCount,
        eventCount: summary.eventCount,
        longLiquidationUsd: moneyUsd(summary.longLiquidatedUsd),
        shortLiquidationUsd: moneyUsd(summary.shortLiquidatedUsd),
        totalLiquidationUsd: moneyUsd(summary.totalLiquidatedUsd),
        totalLiquidatedUsd: moneyUsd(summary.totalLiquidatedUsd),
        longLiquidatedUsd: moneyUsd(summary.longLiquidatedUsd),
        shortLiquidatedUsd: moneyUsd(summary.shortLiquidatedUsd),
        longShortImbalance: round(summary.longShortImbalance, 4),
        longNotionalSharePct: round(longNotionalShare * 100, 1),
        shortNotionalSharePct: round(shortNotionalShare * 100, 1),
        largestLiquidation: summary.largestLiquidation
          ? {
              ...summary.largestLiquidation,
              notionalUsd: moneyUsd(summary.largestLiquidation.notionalUsd),
              timestamp: new Date(summary.largestLiquidation.timestamp).toISOString()
            }
          : null,
        topSymbolsByLiquidation: summary.topSymbolsByLiquidation.map((item) => ({
          symbol: item.symbol,
          totalLiquidatedUsd: moneyUsd(item.totalLiquidatedUsd),
          longLiquidatedUsd: moneyUsd(item.longLiquidatedUsd),
          shortLiquidatedUsd: moneyUsd(item.shortLiquidatedUsd),
          eventCount: item.eventCount
        })),
        timeline: summary.timeline.map((bucket) => ({
          from: new Date(bucket.fromTime).toISOString(),
          to: new Date(bucket.toTime).toISOString(),
          longLiquidatedUsd: moneyUsd(bucket.longLiquidatedUsd),
          shortLiquidatedUsd: moneyUsd(bucket.shortLiquidatedUsd),
          totalLiquidatedUsd: moneyUsd(bucket.totalLiquidatedUsd),
          eventCount: bucket.eventCount
        })),
        netPressure: summary.netPressure,
        collector: collectorState ?? null,
        limitation: "Binance liquidation stream is live-only. This widget reads stored local events and local history starts when the collector is running."
      },
      sources: [summarySource(summary, context)],
      updatedAt: new Date(summary.toTime).toISOString()
    };
  }
};
