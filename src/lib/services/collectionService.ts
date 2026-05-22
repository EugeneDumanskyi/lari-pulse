import { appConfig } from "@/lib/config/appConfig";
import { getDatabase } from "@/lib/db/client";
import { initializeDatabase } from "@/lib/db/initialize";
import { upsertCandles } from "@/lib/db/repositories/candlesRepository";
import {
  insertSourceRun,
  updateSourceRun
} from "@/lib/db/repositories/sourceRunsRepository";
import type { CollectorError, NormalizedCandle } from "@/lib/collectors/types";
import { fetchBinanceCandles } from "@/lib/collectors/binanceCollector";

export interface CollectionRunOptions {
  symbols?: string[];
  timeframes?: string[];
  limit?: number;
}

export interface CollectionRunResult {
  status: "ok" | "partial" | "error";
  sourceRunId: number;
  symbolsProcessed: number;
  timeframesProcessed: number;
  candlesFetched: number;
  candlesInsertedOrUpdated: number;
  startedAt: string;
  finishedAt: string;
  errors: CollectorError[];
}

const COLLECTOR_ID = "binance_ohlcv";
const SOURCE = "binance";
const DEFAULT_KLINE_LIMIT = 100;
const MAX_KLINE_LIMIT = 1000;

function getConfiguredSymbols() {
  return appConfig.symbols
    .filter((symbol) => symbol.isActive && symbol.source === SOURCE)
    .map((symbol) => symbol.symbol);
}

function getRequestedValues(
  requested: string[] | undefined,
  allowed: readonly string[],
  label: string
) {
  if (!requested || requested.length === 0) {
    return [...allowed];
  }

  const invalid = requested.filter((value) => !allowed.includes(value));

  if (invalid.length > 0) {
    throw new Error(`Unsupported ${label}: ${invalid.join(", ")}`);
  }

  return [...new Set(requested)];
}

function getCollectionLimit(limit: number | undefined) {
  const configuredLimit = Number(process.env.BINANCE_KLINE_LIMIT ?? DEFAULT_KLINE_LIMIT);
  const requestedLimit = limit ?? configuredLimit;

  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > MAX_KLINE_LIMIT) {
    throw new Error(`Binance candle limit must be an integer from 1 to ${MAX_KLINE_LIMIT}`);
  }

  return requestedLimit;
}

function summarizeMetadata(result: Omit<CollectionRunResult, "sourceRunId">) {
  return JSON.stringify({
    status: result.status,
    symbolsProcessed: result.symbolsProcessed,
    timeframesProcessed: result.timeframesProcessed,
    candlesFetched: result.candlesFetched,
    candlesInsertedOrUpdated: result.candlesInsertedOrUpdated,
    errors: result.errors
  });
}

export async function runBinanceCollection(
  options: CollectionRunOptions = {}
): Promise<CollectionRunResult> {
  await initializeDatabase();

  const db = getDatabase();
  const startedAt = new Date().toISOString();
  const sourceRunId = insertSourceRun(db, {
    source: SOURCE,
    collectorId: COLLECTOR_ID,
    status: "running",
    startedAt
  });

  const allowedSymbols = getConfiguredSymbols();
  const allowedTimeframes = appConfig.timeframes;
  const symbols = getRequestedValues(options.symbols, allowedSymbols, "symbols");
  const timeframes = getRequestedValues(options.timeframes, allowedTimeframes, "timeframes");
  const limit = getCollectionLimit(options.limit);
  const errors: CollectorError[] = [];
  let candlesFetched = 0;
  let candlesInsertedOrUpdated = 0;
  let successfulPairs = 0;

  try {
    for (const symbol of symbols) {
      for (const timeframe of timeframes) {
        try {
          const result = await fetchBinanceCandles({
            symbol,
            timeframe,
            limit
          });

          const candles: NormalizedCandle[] = result.candles;
          candlesFetched += candles.length;
          candlesInsertedOrUpdated += upsertCandles(db, candles);
          successfulPairs += 1;
        } catch (error) {
          errors.push({
            symbol,
            timeframe,
            message: error instanceof Error ? error.message : "Unknown collection error"
          });
        }
      }
    }

    const finishedAt = new Date().toISOString();
    const status: CollectionRunResult["status"] =
      successfulPairs === 0 ? "error" : errors.length > 0 ? "partial" : "ok";
    const resultWithoutId = {
      status,
      symbolsProcessed: symbols.length,
      timeframesProcessed: timeframes.length,
      candlesFetched,
      candlesInsertedOrUpdated,
      startedAt,
      finishedAt,
      errors
    };

    updateSourceRun(db, sourceRunId, {
      status: status === "ok" ? "success" : "failure",
      finishedAt,
      errorMessage: errors.length > 0 ? `${errors.length} collection request(s) failed` : null,
      metadataJson: summarizeMetadata(resultWithoutId)
    });

    return {
      sourceRunId,
      ...resultWithoutId
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : "Unknown collection failure";

    updateSourceRun(db, sourceRunId, {
      status: "failure",
      finishedAt,
      errorMessage: message,
      metadataJson: JSON.stringify({
        status: "error",
        symbolsProcessed: symbols.length,
        timeframesProcessed: timeframes.length,
        candlesFetched,
        candlesInsertedOrUpdated,
        errors
      })
    });

    return {
      status: "error",
      sourceRunId,
      symbolsProcessed: symbols.length,
      timeframesProcessed: timeframes.length,
      candlesFetched,
      candlesInsertedOrUpdated,
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
