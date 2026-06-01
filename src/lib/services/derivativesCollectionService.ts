import { appConfig } from "@/lib/config/appConfig";
import { collectionTimeframes, sourceTimeframeForCollection } from "@/lib/config/timeframes";
import { fetchBinanceDerivativesMetrics } from "@/lib/collectors/binanceDerivativesCollector";
import type { CollectorError } from "@/lib/collectors/types";
import { getDatabase } from "@/lib/db/client";
import { initializeDatabase } from "@/lib/db/initialize";
import { upsertDerivativesMetrics } from "@/lib/db/repositories/derivativesRepository";
import { insertSourceRun, updateSourceRun } from "@/lib/db/repositories/sourceRunsRepository";

const SOURCE = "binance_futures";
const COLLECTOR_ID = "binance_derivatives";
const DEFAULT_HISTORY_LIMIT = 30;
const MAX_HISTORY_LIMIT = 500;

export interface DerivativesCollectionOptions {
  symbols?: string[];
  periods?: string[];
  historyLimit?: number;
}

export interface DerivativesCollectionResult {
  status: "ok" | "partial" | "error";
  sourceRunId: number;
  symbolsProcessed: number;
  periodsProcessed: number;
  metricsFetched: number;
  metricsInsertedOrUpdated: number;
  startedAt: string;
  finishedAt: string;
  errors: CollectorError[];
}

function activeCryptoSymbols() {
  return appConfig.symbols
    .filter((symbol) => symbol.isActive && symbol.assetType === "crypto")
    .map((symbol) => symbol.symbol);
}

function requestedValues(requested: string[] | undefined, allowed: readonly string[], label: string) {
  if (!requested || requested.length === 0) {
    return [...allowed];
  }

  const normalized = requested.map((value) => value.trim());
  const invalid = normalized.filter((value) => !allowed.includes(value));

  if (invalid.length > 0) {
    throw new Error(`Unsupported ${label}: ${invalid.join(", ")}`);
  }

  return [...new Set(normalized)];
}

function getHistoryLimit(limit: number | undefined) {
  const requestedLimit = limit ?? Number(process.env.BINANCE_DERIVATIVES_HISTORY_LIMIT ?? DEFAULT_HISTORY_LIMIT);

  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > MAX_HISTORY_LIMIT) {
    throw new Error(`Binance derivatives history limit must be an integer from 1 to ${MAX_HISTORY_LIMIT}`);
  }

  return requestedLimit;
}

function normalizePeriods(periods: string[]) {
  const supportedPeriods = new Set(collectionTimeframes);

  return [...new Set(periods.map((period) => sourceTimeframeForCollection(period)))].filter((period) =>
    supportedPeriods.has(period as (typeof collectionTimeframes)[number])
  );
}

function summarizeMetadata(result: Omit<DerivativesCollectionResult, "sourceRunId">) {
  return JSON.stringify({
    status: result.status,
    symbolsProcessed: result.symbolsProcessed,
    periodsProcessed: result.periodsProcessed,
    metricsFetched: result.metricsFetched,
    metricsInsertedOrUpdated: result.metricsInsertedOrUpdated,
    errors: result.errors
  });
}

export async function runBinanceDerivativesCollection(
  options: DerivativesCollectionOptions = {}
): Promise<DerivativesCollectionResult> {
  await initializeDatabase();

  const db = getDatabase();
  const startedAt = new Date().toISOString();
  const sourceRunId = insertSourceRun(db, {
    source: SOURCE,
    collectorId: COLLECTOR_ID,
    status: "running",
    startedAt
  });
  const symbols = requestedValues(options.symbols, activeCryptoSymbols(), "symbols");
  const requestedPeriods = requestedValues(options.periods, appConfig.timeframes, "periods");
  const periods = normalizePeriods(requestedPeriods);
  const historyLimit = getHistoryLimit(options.historyLimit);
  const errors: CollectorError[] = [];
  let successfulPairs = 0;
  let metricsFetched = 0;
  let metricsInsertedOrUpdated = 0;

  try {
    for (const symbol of symbols) {
      for (const period of periods) {
        try {
          const result = await fetchBinanceDerivativesMetrics(
            {
              symbol,
              period
            },
            {
              historyLimit
            }
          );

          metricsFetched += result.metrics.length;
          metricsInsertedOrUpdated += upsertDerivativesMetrics(db, result.metrics);
          successfulPairs += 1;
        } catch (error) {
          errors.push({
            symbol,
            timeframe: period,
            message: error instanceof Error ? error.message : "Unknown derivatives collection error"
          });
        }
      }
    }

    const finishedAt = new Date().toISOString();
    const status: DerivativesCollectionResult["status"] =
      successfulPairs === 0 ? "error" : errors.length > 0 ? "partial" : "ok";
    const resultWithoutId = {
      status,
      symbolsProcessed: symbols.length,
      periodsProcessed: periods.length,
      metricsFetched,
      metricsInsertedOrUpdated,
      startedAt,
      finishedAt,
      errors
    };

    updateSourceRun(db, sourceRunId, {
      status: status === "ok" ? "success" : "failure",
      finishedAt,
      errorMessage: errors.length > 0 ? `${errors.length} derivatives request(s) failed` : null,
      metadataJson: summarizeMetadata(resultWithoutId)
    });

    return {
      sourceRunId,
      ...resultWithoutId
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : "Unknown derivatives collection failure";

    updateSourceRun(db, sourceRunId, {
      status: "failure",
      finishedAt,
      errorMessage: message,
      metadataJson: JSON.stringify({
        status: "error",
        symbolsProcessed: symbols.length,
        periodsProcessed: periods.length,
        metricsFetched,
        metricsInsertedOrUpdated,
        errors
      })
    });

    return {
      status: "error",
      sourceRunId,
      symbolsProcessed: symbols.length,
      periodsProcessed: periods.length,
      metricsFetched,
      metricsInsertedOrUpdated,
      startedAt,
      finishedAt,
      errors: [
        ...errors,
        {
          symbol: "*",
          timeframe: "*",
          message
        }
      ]
    };
  }
}
