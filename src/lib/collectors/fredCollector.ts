import type { NormalizedCandle } from "./types";

const FRED_SOURCE = "fred" as const;
const FRED_TIMEFRAME = "1d";

interface FredCsvRow {
  date: string;
  value: string;
}

export interface FredFetchRequest {
  symbol: string;
  seriesId: string;
  timeframe: string;
  limit: number;
}

export interface FredFetchResult {
  symbol: string;
  timeframe: string;
  candles: NormalizedCandle[];
}

export interface FredCollectorOptions {
  baseUrl?: string;
  timeoutMs?: number;
}

function getFredBaseUrl(baseUrl?: string) {
  return (baseUrl ?? process.env.FRED_BASE_URL ?? "https://fred.stlouisfed.org").replace(/\/$/, "");
}

function parseNumber(value: string) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid FRED observation value: ${value}`);
  }

  return parsed;
}

function parseDateOpenTime(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);

  if (!match) {
    throw new Error(`Invalid FRED observation date: ${date}`);
  }

  const [, year, month, day] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day));
}

function parseCsv(text: string, seriesId: string): FredCsvRow[] {
  const lines = text.trim().split(/\r?\n/);

  if (lines.length <= 1) {
    throw new Error("FRED returned no observations");
  }

  const header = lines[0].split(",").map((value) => value.trim().toLowerCase());

  if (header[0] !== "observation_date" || header[1] !== seriesId.toLowerCase()) {
    throw new Error("FRED returned an invalid CSV header");
  }

  return lines.slice(1).flatMap((line) => {
    const [date, value] = line.split(",").map((item) => item.trim());

    if (!date || value === undefined) {
      throw new Error("FRED returned a malformed observation row");
    }

    if (value === ".") {
      return [];
    }

    return [{ date, value }];
  });
}

export function normalizeFredRow(
  symbol: string,
  timeframe: string,
  row: FredCsvRow
): NormalizedCandle {
  const openTime = parseDateOpenTime(row.date);
  const value = parseNumber(row.value);

  return {
    symbol,
    timeframe,
    openTime,
    closeTime: openTime + 86_400_000 - 1,
    open: value,
    high: value,
    low: value,
    close: value,
    volume: 0,
    source: FRED_SOURCE
  };
}

async function fetchTextWithTimeout(url: URL, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        accept: "text/csv,text/plain"
      },
      signal: controller.signal
    });
    const body = await response.text();

    if (!response.ok) {
      throw new Error(`FRED error ${response.status}`);
    }

    return body;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchFredDailySeries(
  request: FredFetchRequest,
  options: FredCollectorOptions = {}
): Promise<FredFetchResult> {
  if (request.timeframe !== FRED_TIMEFRAME) {
    throw new Error("FRED collector currently supports only 1d observations");
  }

  const baseUrl = getFredBaseUrl(options.baseUrl);
  const url = new URL("/graph/fredgraph.csv", baseUrl);
  url.searchParams.set("id", request.seriesId);

  const body = await fetchTextWithTimeout(url, options.timeoutMs ?? 12_000);
  const candles = parseCsv(body, request.seriesId)
    .map((row) => normalizeFredRow(request.symbol, request.timeframe, row))
    .slice(-request.limit);

  if (candles.length === 0) {
    throw new Error("FRED returned no observations after normalization");
  }

  return {
    symbol: request.symbol,
    timeframe: request.timeframe,
    candles
  };
}
