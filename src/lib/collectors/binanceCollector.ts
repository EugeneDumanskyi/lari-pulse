import type { CandleFetchRequest, CandleFetchResult, NormalizedCandle } from "./types";
import { derivedDaysForTimeframe, sourceTimeframeForCollection } from "@/lib/config/timeframes";

const BINANCE_SOURCE = "binance" as const;

type BinanceKline = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  number,
  string,
  string,
  string
];

interface BinanceErrorResponse {
  code?: number;
  msg?: string;
}

export interface BinanceCollectorOptions {
  baseUrl?: string;
  timeoutMs?: number;
}

function getBinanceBaseUrl(baseUrl?: string) {
  return (baseUrl ?? process.env.BINANCE_BASE_URL ?? "https://api.binance.com").replace(/\/$/, "");
}

function isBinanceKline(value: unknown): value is BinanceKline {
  return (
    Array.isArray(value) &&
    value.length >= 11 &&
    typeof value[0] === "number" &&
    typeof value[1] === "string" &&
    typeof value[2] === "string" &&
    typeof value[3] === "string" &&
    typeof value[4] === "string" &&
    typeof value[5] === "string" &&
    typeof value[6] === "number"
  );
}

function parseNumber(value: string, field: string) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid Binance candle ${field}: ${value}`);
  }

  return parsed;
}

export function normalizeBinanceKline(
  symbol: string,
  timeframe: string,
  kline: BinanceKline
): NormalizedCandle {
  return {
    symbol,
    timeframe,
    openTime: kline[0],
    open: parseNumber(kline[1], "open"),
    high: parseNumber(kline[2], "high"),
    low: parseNumber(kline[3], "low"),
    close: parseNumber(kline[4], "close"),
    volume: parseNumber(kline[5], "volume"),
    closeTime: kline[6],
    source: BINANCE_SOURCE
  };
}

function aggregateCandlesByDays(
  symbol: string,
  timeframe: string,
  candles: NormalizedCandle[],
  days: number
): NormalizedCandle[] {
  const aggregated: NormalizedCandle[] = [];

  for (let end = candles.length; end > 0; end -= days) {
    const start = Math.max(0, end - days);
    const chunk = candles.slice(start, end);
    const first = chunk[0];
    const last = chunk.at(-1);

    if (!first || !last) {
      continue;
    }

    aggregated.unshift({
      symbol,
      timeframe,
      openTime: first.openTime,
      closeTime: last.closeTime,
      open: first.open,
      high: Math.max(...chunk.map((candle) => candle.high)),
      low: Math.min(...chunk.map((candle) => candle.low)),
      close: last.close,
      volume: chunk.reduce((total, candle) => total + candle.volume, 0),
      source: BINANCE_SOURCE
    });
  }

  return aggregated;
}

async function fetchJsonWithTimeout(url: URL, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json"
      },
      signal: controller.signal
    });

    const body = (await response.json().catch(() => null)) as unknown;

    if (!response.ok) {
      const binanceError = body as BinanceErrorResponse | null;
      const message = binanceError?.msg
        ? `Binance error ${response.status}: ${binanceError.msg}`
        : `Binance error ${response.status}`;

      throw new Error(message);
    }

    return body;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchBinanceCandles(
  request: CandleFetchRequest,
  options: BinanceCollectorOptions = {}
): Promise<CandleFetchResult> {
  const baseUrl = getBinanceBaseUrl(options.baseUrl);
  const url = new URL("/api/v3/klines", baseUrl);
  const derivedDays = derivedDaysForTimeframe(request.timeframe);
  const sourceTimeframe = sourceTimeframeForCollection(request.timeframe);
  const sourceLimit = derivedDays ? Math.min(1000, Math.max(derivedDays, request.limit * derivedDays)) : request.limit;

  url.searchParams.set("symbol", request.symbol);
  url.searchParams.set("interval", sourceTimeframe);
  url.searchParams.set("limit", String(sourceLimit));

  const body = await fetchJsonWithTimeout(url, options.timeoutMs ?? 12_000);

  if (!Array.isArray(body)) {
    throw new Error("Binance returned an invalid kline payload");
  }

  if (body.length === 0) {
    throw new Error("Binance returned no candles");
  }

  const sourceCandles = body.map((item) => {
    if (!isBinanceKline(item)) {
      throw new Error("Binance returned a malformed candle row");
    }

    return normalizeBinanceKline(request.symbol, sourceTimeframe, item);
  });
  const candles = derivedDays
    ? aggregateCandlesByDays(request.symbol, request.timeframe, sourceCandles, derivedDays)
    : sourceCandles;

  return {
    symbol: request.symbol,
    timeframe: request.timeframe,
    candles
  };
}
