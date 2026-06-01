import type Database from "better-sqlite3";
import { sourceTimeframeForCollection } from "@/lib/config/timeframes";
import { getLatestDerivativesMetrics } from "@/lib/db/repositories/derivativesRepository";
import type { WidgetDerivativesContext } from "@/lib/widgets/types";

export function buildDerivativesWidgetContext(
  db: Database.Database,
  input: {
    symbol: string;
    timeframes: string[];
  }
) {
  const summaries: Record<string, WidgetDerivativesContext | undefined> = {};

  for (const timeframe of input.timeframes) {
    const period = sourceTimeframeForCollection(timeframe);

    try {
      const latest = getLatestDerivativesMetrics(db, {
        symbol: input.symbol,
        period,
        source: "binance_futures",
        limit: 120
      });

      summaries[timeframe] = latest
        ? {
            ...latest,
            period: timeframe
          }
        : undefined;
    } catch (error) {
      summaries[timeframe] = {
        symbol: input.symbol,
        period: timeframe,
        source: "binance_futures",
        updatedAt: null,
        fundingRate: null,
        nextFundingTime: null,
        markPrice: null,
        indexPrice: null,
        openInterest: null,
        openInterestValue: null,
        openInterestChangePct: null,
        longShortRatio: null,
        longAccount: null,
        shortAccount: null,
        basis: null,
        basisRate: null,
        annualizedBasisRate: null,
        futuresPrice: null,
        sampleCount: 0,
        storageError: error instanceof Error ? error.message : "Unable to read stored derivatives metrics"
      };
    }
  }

  return {
    [input.symbol]: summaries
  };
}
