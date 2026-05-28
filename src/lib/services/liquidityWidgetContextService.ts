import type Database from "better-sqlite3";
import type {
  WidgetLiquidationSummary,
  WidgetLiquidityContext
} from "@/lib/widgets/types";
import { getLiquidationIntervalSummary } from "./liquidationEventStreamService";

function mapLiquidationSummary(summary: ReturnType<typeof getLiquidationIntervalSummary>): WidgetLiquidationSummary {
  return {
    symbol: summary.symbol,
    source: summary.source,
    timeframe: summary.timeframe,
    fromTime: summary.fromTime,
    toTime: summary.toTime,
    longCount: summary.longCount,
    shortCount: summary.shortCount,
    longNotionalUsd: summary.longNotionalUsd,
    shortNotionalUsd: summary.shortNotionalUsd,
    totalNotionalUsd: summary.totalNotionalUsd,
    longLiquidatedUsd: summary.longLiquidatedUsd,
    shortLiquidatedUsd: summary.shortLiquidatedUsd,
    totalLiquidatedUsd: summary.totalLiquidatedUsd,
    longShortImbalance: summary.longShortImbalance,
    eventCount: summary.eventCount,
    largestLiquidation: summary.largestLiquidation,
    topSymbolsByLiquidation: summary.topSymbolsByLiquidation,
    timeline: summary.timeline,
    longShare: summary.longShare,
    shortShare: summary.shortShare,
    netPressure: summary.netPressure,
    collector: summary.collector
  };
}

export function buildLiquidityWidgetContext(
  db: Database.Database,
  input: {
    symbol: string;
    timeframes: string[];
    now: Date;
  }
): WidgetLiquidityContext {
  const summaries: Record<string, WidgetLiquidationSummary | undefined> = {};

  for (const timeframe of input.timeframes) {
    try {
      summaries[timeframe] = mapLiquidationSummary(
        getLiquidationIntervalSummary(
          {
            symbol: input.symbol,
            timeframe,
            now: input.now
          },
          db
        )
      );
    } catch (error) {
      summaries[timeframe] = {
        symbol: input.symbol,
        source: "binance_futures",
        timeframe,
        fromTime: input.now.getTime(),
        toTime: input.now.getTime(),
        longCount: 0,
        shortCount: 0,
        longNotionalUsd: 0,
        shortNotionalUsd: 0,
        totalNotionalUsd: 0,
        longLiquidatedUsd: 0,
        shortLiquidatedUsd: 0,
        totalLiquidatedUsd: 0,
        longShortImbalance: 0,
        eventCount: 0,
        largestLiquidation: null,
        topSymbolsByLiquidation: [],
        timeline: [],
        longShare: 0,
        shortShare: 0,
        netPressure: "balanced",
        storageError: error instanceof Error ? error.message : "Unable to read stored liquidation events"
      };
    }
  }

  return {
    liquidationSummaries: {
      [input.symbol]: summaries
    }
  };
}
