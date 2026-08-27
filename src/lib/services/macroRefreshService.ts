import type Database from "better-sqlite3";
import { getCrossMarketWidgets } from "./crossMarketWidgetService";
import { runFredCollection, type FredCollectionResult } from "./fredCollectionService";

export interface MacroRefreshOptions {
  collect?: boolean;
  calculateWidgets?: boolean;
  timeframe?: string;
  limit?: number;
  now?: Date;
  db?: Database.Database;
}

export interface CrossMarketWidgetPersistenceResult {
  status: "ok" | "partial" | "error";
  widgetsRun: number;
  widgetsSaved: number;
  warnings: string[];
  updatedAt: string;
}

export interface MacroRefreshResult {
  status: "ok" | "partial" | "error";
  collection?: FredCollectionResult;
  widgetPersistence?: CrossMarketWidgetPersistenceResult;
}

function mergeStatuses(
  collectionStatus?: FredCollectionResult["status"],
  widgetStatus?: CrossMarketWidgetPersistenceResult["status"]
): MacroRefreshResult["status"] {
  if (collectionStatus === "error" || widgetStatus === "error") {
    return "error";
  }

  if (collectionStatus === "partial" || widgetStatus === "partial") {
    return "partial";
  }

  return "ok";
}

export async function runMacroRefresh(
  options: MacroRefreshOptions = {}
): Promise<MacroRefreshResult> {
  const shouldCollect = options.collect !== false;
  const shouldCalculateWidgets = options.calculateWidgets !== false;
  const collection = shouldCollect
    ? await runFredCollection({
        db: options.db,
        timeframes: [options.timeframe ?? "1d"],
        limit: options.limit
      })
    : undefined;
  const crossMarket = shouldCalculateWidgets
    ? await getCrossMarketWidgets({
        db: options.db,
        timeframe: options.timeframe ?? "1d",
        candleLimit: options.limit,
        now: options.now,
        saveResults: true
      })
    : undefined;
  const widgetPersistence: CrossMarketWidgetPersistenceResult | undefined = crossMarket
    ? {
        status:
          crossMarket.results.length === 0
            ? "error"
            : crossMarket.warnings.length > 0
              ? "partial"
              : "ok",
        widgetsRun: crossMarket.results.length,
        widgetsSaved: crossMarket.results.filter((result) => result.id > 0).length,
        warnings: crossMarket.warnings,
        updatedAt: crossMarket.updatedAt
      }
    : undefined;

  return {
    status: mergeStatuses(collection?.status, widgetPersistence?.status),
    collection,
    widgetPersistence
  };
}
