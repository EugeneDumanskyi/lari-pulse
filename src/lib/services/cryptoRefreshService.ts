import { runBinanceCollection, type CollectionRunOptions } from "./collectionService";
import {
  runWidgetCalculations,
  type WidgetCalculationResult
} from "./widgetCalculationService";

export interface CryptoRefreshOptions extends CollectionRunOptions {
  calculateWidgets?: boolean;
}

export interface CryptoRefreshResult {
  status: "ok" | "partial" | "error";
  collection: Awaited<ReturnType<typeof runBinanceCollection>>;
  widgetCalculation?: WidgetCalculationResult;
}

function mergeStatuses(
  collectionStatus: CryptoRefreshResult["collection"]["status"],
  widgetStatus?: WidgetCalculationResult["status"]
): CryptoRefreshResult["status"] {
  if (collectionStatus === "error" || widgetStatus === "error") {
    return "error";
  }

  if (collectionStatus === "partial" || widgetStatus === "partial") {
    return "partial";
  }

  return "ok";
}

export async function runCryptoRefresh(
  options: CryptoRefreshOptions = {}
): Promise<CryptoRefreshResult> {
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
