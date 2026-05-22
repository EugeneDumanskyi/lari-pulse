import { runBinanceCollection, type CollectionRunOptions } from "./collectionService";
import {
  runWidgetCalculations,
  type WidgetCalculationResult
} from "./widgetCalculationService";

export interface Phase1RefreshOptions extends CollectionRunOptions {
  calculateWidgets?: boolean;
}

export interface Phase1RefreshResult {
  status: "ok" | "partial" | "error";
  collection: Awaited<ReturnType<typeof runBinanceCollection>>;
  widgetCalculation?: WidgetCalculationResult;
}

function mergeStatuses(
  collectionStatus: Phase1RefreshResult["collection"]["status"],
  widgetStatus?: WidgetCalculationResult["status"]
): Phase1RefreshResult["status"] {
  if (collectionStatus === "error" || widgetStatus === "error") {
    return "error";
  }

  if (collectionStatus === "partial" || widgetStatus === "partial") {
    return "partial";
  }

  return "ok";
}

export async function runPhase1Refresh(
  options: Phase1RefreshOptions = {}
): Promise<Phase1RefreshResult> {
  const collection = await runBinanceCollection({
    symbols: options.symbols,
    timeframes: options.timeframes,
    limit: options.limit
  });

  const widgetCalculation =
    options.calculateWidgets === false
      ? undefined
      : await runWidgetCalculations({
          symbols: options.symbols,
          timeframes: options.timeframes
        });

  return {
    status: mergeStatuses(collection.status, widgetCalculation?.status),
    collection,
    widgetCalculation
  };
}
