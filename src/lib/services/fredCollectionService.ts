import type Database from "better-sqlite3";
import { fetchFredDailySeries } from "@/lib/collectors/fredCollector";
import type { CollectorError, NormalizedCandle } from "@/lib/collectors/types";
import { phase2Symbols } from "@/lib/config/symbols";
import { closeDatabase, getDatabase } from "@/lib/db/client";
import { initializeDatabase } from "@/lib/db/initialize";
import { upsertCandles } from "@/lib/db/repositories/candlesRepository";
import {
  insertSourceRun,
  updateSourceRun
} from "@/lib/db/repositories/sourceRunsRepository";
import { seedSymbols } from "@/lib/db/repositories/symbolsRepository";

export interface FredCollectionOptions {
  symbols?: string[];
  timeframes?: string[];
  limit?: number;
  db?: Database.Database;
}

export interface FredCollectionResult {
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

const SOURCE = "fred";
const COLLECTOR_ID = "fred_daily_series";
const DEFAULT_LIMIT = 260;
const MAX_LIMIT = 5000;
const SUPPORTED_TIMEFRAMES = ["1d"] as const;

function getConfiguredSymbols() {
  return phase2Symbols.filter((symbol) => symbol.source === SOURCE);
}

function requestedValues<T extends string>(
  requested: string[] | undefined,
  allowed: readonly T[],
  label: string
): T[] {
  if (!requested || requested.length === 0) {
    return [...allowed];
  }

  const invalid = requested.filter((value) => !allowed.includes(value as T));

  if (invalid.length > 0) {
    throw new Error(`Unsupported ${label}: ${invalid.join(", ")}`);
  }

  return [...new Set(requested)] as T[];
}

function collectionLimit(limit: number | undefined) {
  const requestedLimit = limit ?? DEFAULT_LIMIT;

  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > MAX_LIMIT) {
    throw new Error(`FRED observation limit must be an integer from 1 to ${MAX_LIMIT}`);
  }

  return requestedLimit;
}

function summarizeMetadata(result: Omit<FredCollectionResult, "sourceRunId">) {
  return JSON.stringify({
    status: result.status,
    symbolsProcessed: result.symbolsProcessed,
    timeframesProcessed: result.timeframesProcessed,
    candlesFetched: result.candlesFetched,
    candlesInsertedOrUpdated: result.candlesInsertedOrUpdated,
    errors: result.errors
  });
}

export async function runFredCollection(
  options: FredCollectionOptions = {}
): Promise<FredCollectionResult> {
  if (!options.db) {
    await initializeDatabase();
  }

  const db = options.db ?? getDatabase();
  seedSymbols(db, phase2Symbols);

  const startedAt = new Date().toISOString();
  const sourceRunId = insertSourceRun(db, {
    source: SOURCE,
    collectorId: COLLECTOR_ID,
    status: "running",
    startedAt
  });

  const configuredSymbols = getConfiguredSymbols();
  const symbolConfigs = requestedValues(
    options.symbols,
    configuredSymbols.map((symbol) => symbol.symbol),
    "symbols"
  ).map((symbol) => configuredSymbols.find((config) => config.symbol === symbol)!);
  const timeframes = requestedValues(options.timeframes, SUPPORTED_TIMEFRAMES, "timeframes");
  const limit = collectionLimit(options.limit);
  const errors: CollectorError[] = [];
  let candlesFetched = 0;
  let candlesInsertedOrUpdated = 0;
  let successfulPairs = 0;

  try {
    for (const symbol of symbolConfigs) {
      for (const timeframe of timeframes) {
        try {
          const result = await fetchFredDailySeries({
            symbol: symbol.symbol,
            seriesId: symbol.providerSymbol ?? symbol.symbol,
            timeframe,
            limit
          });
          const candles: NormalizedCandle[] = result.candles;

          candlesFetched += candles.length;
          candlesInsertedOrUpdated += upsertCandles(db, candles);
          successfulPairs += 1;
        } catch (error) {
          errors.push({
            symbol: symbol.symbol,
            timeframe,
            message: error instanceof Error ? error.message : "Unknown FRED collection error"
          });
        }
      }
    }

    const finishedAt = new Date().toISOString();
    const status: FredCollectionResult["status"] =
      successfulPairs === 0 ? "error" : errors.length > 0 ? "partial" : "ok";
    const resultWithoutId = {
      status,
      symbolsProcessed: symbolConfigs.length,
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
      errorMessage: errors.length > 0 ? `${errors.length} FRED collection request(s) failed` : null,
      metadataJson: summarizeMetadata(resultWithoutId)
    });

    return {
      sourceRunId,
      ...resultWithoutId
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : "Unknown FRED collection failure";

    updateSourceRun(db, sourceRunId, {
      status: "failure",
      finishedAt,
      errorMessage: message,
      metadataJson: JSON.stringify({
        status: "error",
        symbolsProcessed: symbolConfigs.length,
        timeframesProcessed: timeframes.length,
        candlesFetched,
        candlesInsertedOrUpdated,
        errors
      })
    });

    return {
      status: "error",
      sourceRunId,
      symbolsProcessed: symbolConfigs.length,
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

if (process.argv[1]?.endsWith("fredCollectionService.ts")) {
  runFredCollection()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      closeDatabase();
    })
    .catch((error) => {
      console.error(error);
      closeDatabase();
      process.exitCode = 1;
    });
}
