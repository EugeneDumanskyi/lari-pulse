import type Database from "better-sqlite3";
import { appConfig } from "@/lib/config/appConfig";
import { getDatabase } from "@/lib/db/client";
import { initializeDatabase } from "@/lib/db/initialize";
import { getCandlesBySymbolTimeframe } from "@/lib/db/repositories/candlesRepository";
import type { CandleRecord } from "@/lib/db/types";
import { buildPhase1MarketContext } from "@/lib/widgets/marketContext";
import { widgetRegistry, type WidgetRegistry } from "@/lib/widgets/registry";
import { runWidgetRegistry } from "@/lib/widgets/runner";
import type { WidgetRunOutcome } from "@/lib/widgets/types";
import { buildLiquidityWidgetContext } from "./liquidityWidgetContextService";
import { buildDerivativesWidgetContext } from "./derivativesWidgetContextService";

export interface WidgetCalculationOptions {
  symbols?: string[];
  timeframes?: string[];
  candleLimit?: number;
  now?: Date;
  db?: Database.Database;
  registry?: WidgetRegistry;
}

export interface WidgetCalculationError {
  symbol: string;
  timeframe: string;
  widgetId?: string;
  message: string;
}

export interface WidgetCalculationResult {
  status: "ok" | "partial" | "error";
  symbolsProcessed: number;
  timeframesProcessed: number;
  widgetsRun: number;
  widgetsSaved: number;
  startedAt: string;
  finishedAt: string;
  errors: WidgetCalculationError[];
}

const DEFAULT_CANDLE_LIMIT = 240;

function activeConfiguredSymbols() {
  return appConfig.symbols.filter((symbol) => symbol.isActive).map((symbol) => symbol.symbol);
}

function requestedValues(requested: string[] | undefined, allowed: readonly string[], label: string) {
  if (!requested || requested.length === 0) {
    return [...allowed];
  }

  const invalid = requested.filter((value) => !allowed.includes(value));

  if (invalid.length > 0) {
    throw new Error(`Unsupported ${label}: ${invalid.join(", ")}`);
  }

  return [...new Set(requested)];
}

function latestCandleUpdatedAt(candles: CandleRecord[]) {
  const latest = candles.at(-1);

  return latest ? new Date(latest.closeTime).toISOString() : undefined;
}

function countSaved(outcomes: WidgetRunOutcome[]) {
  return outcomes.reduce((total, outcome) => {
    if (outcome.status === "success" && outcome.savedRowId) {
      return total + 1;
    }

    return total;
  }, 0);
}

export async function runWidgetCalculations(
  options: WidgetCalculationOptions = {}
): Promise<WidgetCalculationResult> {
  if (!options.db) {
    initializeDatabase();
  }

  const db = options.db ?? getDatabase();
  const registry = options.registry ?? widgetRegistry;
  const now = options.now ?? new Date();
  const startedAt = now.toISOString();
  const candleLimit = options.candleLimit ?? DEFAULT_CANDLE_LIMIT;
  const symbols = requestedValues(options.symbols, activeConfiguredSymbols(), "symbols");
  const timeframes = requestedValues(options.timeframes, appConfig.timeframes, "timeframes");
  const errors: WidgetCalculationError[] = [];
  let widgetsRun = 0;
  let widgetsSaved = 0;

  for (const symbol of symbols) {
    const timeframeCandles = Object.fromEntries(
      timeframes.map((timeframe) => [
        timeframe,
        getCandlesBySymbolTimeframe(db, symbol, timeframe, candleLimit)
      ])
    ) as Record<string, CandleRecord[]>;

    for (const timeframe of timeframes) {
      const candles = timeframeCandles[timeframe] ?? [];

      if (candles.length === 0) {
        errors.push({
          symbol,
          timeframe,
          message: "No stored candles available for widget calculation"
        });
        continue;
      }

      const outcomes = await runWidgetRegistry(
        registry,
        {
          symbol,
          timeframe,
          candles,
          marketContext: buildPhase1MarketContext({
            timeframeCandles,
            latestCandleUpdatedAt: latestCandleUpdatedAt(candles),
            liquidity: buildLiquidityWidgetContext(db, {
              symbol,
              timeframes,
              now
            }),
            derivatives: buildDerivativesWidgetContext(db, {
              symbol,
              timeframes
            })
          }),
          now
        },
        {
          db,
          save: true
        }
      );

      widgetsRun += outcomes.length;
      widgetsSaved += countSaved(outcomes);

      for (const outcome of outcomes) {
        if (outcome.status === "failure") {
          errors.push({
            symbol,
            timeframe,
            widgetId: outcome.widgetId,
            message: outcome.error
          });
        }
      }
    }
  }

  const finishedAt = new Date().toISOString();
  const status: WidgetCalculationResult["status"] =
    widgetsRun === 0 ? "error" : errors.length > 0 ? "partial" : "ok";

  return {
    status,
    symbolsProcessed: symbols.length,
    timeframesProcessed: timeframes.length,
    widgetsRun,
    widgetsSaved,
    startedAt,
    finishedAt,
    errors
  };
}
