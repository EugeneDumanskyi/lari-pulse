import type { NewDerivativesMetric } from "@/lib/db/types";

const SOURCE = "binance_futures" as const;

interface BinanceErrorResponse {
  code?: number;
  msg?: string;
}

interface BinancePremiumIndex {
  symbol: string;
  markPrice: string;
  indexPrice: string;
  lastFundingRate: string;
  nextFundingTime: number;
  time: number;
}

interface BinanceFundingRate {
  symbol: string;
  fundingRate: string;
  fundingTime: number;
  markPrice?: string;
}

interface BinanceOpenInterest {
  symbol: string;
  openInterest: string;
  time: number;
}

interface BinanceOpenInterestHist {
  symbol: string;
  sumOpenInterest: string;
  sumOpenInterestValue: string;
  timestamp: string;
}

interface BinanceLongShortRatio {
  symbol: string;
  longShortRatio: string;
  longAccount: string;
  shortAccount: string;
  timestamp: string;
}

interface BinanceBasis {
  pair: string;
  contractType: string;
  basis: string;
  basisRate: string;
  annualizedBasisRate?: string;
  futuresPrice: string;
  indexPrice: string;
  timestamp: number;
}

export interface BinanceDerivativesFetchOptions {
  baseUrl?: string;
  timeoutMs?: number;
  fundingLimit?: number;
  historyLimit?: number;
}

export interface BinanceDerivativesFetchRequest {
  symbol: string;
  period: string;
}

export interface BinanceDerivativesFetchResult {
  symbol: string;
  period: string;
  metrics: NewDerivativesMetric[];
}

function getBinanceFuturesBaseUrl(baseUrl?: string) {
  return (baseUrl ?? process.env.BINANCE_FUTURES_BASE_URL ?? "https://fapi.binance.com").replace(/\/$/, "");
}

function parseNumber(value: string | number | undefined, field: string) {
  if (value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid Binance derivatives ${field}: ${value}`);
  }

  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
        ? `Binance derivatives error ${response.status}: ${binanceError.msg}`
        : `Binance derivatives error ${response.status}`;

      throw new Error(message);
    }

    return body;
  } finally {
    clearTimeout(timeout);
  }
}

function expectObject<T>(value: unknown, label: string): T {
  if (!isRecord(value)) {
    throw new Error(`Binance returned an invalid ${label} payload`);
  }

  return value as T;
}

function expectArray<T>(value: unknown, label: string): T[] {
  if (!Array.isArray(value)) {
    throw new Error(`Binance returned an invalid ${label} payload`);
  }

  return value as T[];
}

function emptyMetric(symbol: string, period: string, metricTime: number): NewDerivativesMetric {
  return {
    symbol,
    period,
    source: SOURCE,
    metricTime,
    fundingRate: null,
    nextFundingTime: null,
    markPrice: null,
    indexPrice: null,
    openInterest: null,
    openInterestValue: null,
    longShortRatio: null,
    longAccount: null,
    shortAccount: null,
    basis: null,
    basisRate: null,
    annualizedBasisRate: null,
    futuresPrice: null,
    metadataJson: null
  };
}

export function normalizePremiumIndex(symbol: string, period: string, payload: BinancePremiumIndex) {
  return {
    ...emptyMetric(symbol, period, payload.time),
    fundingRate: parseNumber(payload.lastFundingRate, "lastFundingRate"),
    nextFundingTime: payload.nextFundingTime,
    markPrice: parseNumber(payload.markPrice, "markPrice"),
    indexPrice: parseNumber(payload.indexPrice, "indexPrice"),
    metadataJson: JSON.stringify({ endpoint: "premiumIndex" })
  };
}

export function normalizeFundingRate(symbol: string, period: string, payload: BinanceFundingRate) {
  return {
    ...emptyMetric(symbol, period, payload.fundingTime),
    fundingRate: parseNumber(payload.fundingRate, "fundingRate"),
    markPrice: parseNumber(payload.markPrice, "markPrice"),
    metadataJson: JSON.stringify({ endpoint: "fundingRate" })
  };
}

export function normalizeOpenInterest(symbol: string, period: string, payload: BinanceOpenInterest) {
  return {
    ...emptyMetric(symbol, period, payload.time),
    openInterest: parseNumber(payload.openInterest, "openInterest"),
    metadataJson: JSON.stringify({ endpoint: "openInterest" })
  };
}

export function normalizeOpenInterestHist(symbol: string, period: string, payload: BinanceOpenInterestHist) {
  return {
    ...emptyMetric(symbol, period, Number(payload.timestamp)),
    openInterest: parseNumber(payload.sumOpenInterest, "sumOpenInterest"),
    openInterestValue: parseNumber(payload.sumOpenInterestValue, "sumOpenInterestValue"),
    metadataJson: JSON.stringify({ endpoint: "openInterestHist" })
  };
}

export function normalizeLongShortRatio(symbol: string, period: string, payload: BinanceLongShortRatio) {
  return {
    ...emptyMetric(symbol, period, Number(payload.timestamp)),
    longShortRatio: parseNumber(payload.longShortRatio, "longShortRatio"),
    longAccount: parseNumber(payload.longAccount, "longAccount"),
    shortAccount: parseNumber(payload.shortAccount, "shortAccount"),
    metadataJson: JSON.stringify({ endpoint: "globalLongShortAccountRatio" })
  };
}

export function normalizeBasis(symbol: string, period: string, payload: BinanceBasis) {
  return {
    ...emptyMetric(symbol, period, payload.timestamp),
    basis: parseNumber(payload.basis, "basis"),
    basisRate: parseNumber(payload.basisRate, "basisRate"),
    annualizedBasisRate: parseNumber(payload.annualizedBasisRate, "annualizedBasisRate"),
    futuresPrice: parseNumber(payload.futuresPrice, "futuresPrice"),
    indexPrice: parseNumber(payload.indexPrice, "indexPrice"),
    metadataJson: JSON.stringify({ endpoint: "basis", contractType: payload.contractType })
  };
}

export async function fetchBinanceDerivativesMetrics(
  request: BinanceDerivativesFetchRequest,
  options: BinanceDerivativesFetchOptions = {}
): Promise<BinanceDerivativesFetchResult> {
  const baseUrl = getBinanceFuturesBaseUrl(options.baseUrl);
  const timeoutMs = options.timeoutMs ?? 12_000;
  const fundingLimit = options.fundingLimit ?? 8;
  const historyLimit = options.historyLimit ?? 30;
  const metrics: NewDerivativesMetric[] = [];

  const premiumUrl = new URL("/fapi/v1/premiumIndex", baseUrl);
  premiumUrl.searchParams.set("symbol", request.symbol);
  metrics.push(
    normalizePremiumIndex(
      request.symbol,
      request.period,
      expectObject<BinancePremiumIndex>(await fetchJsonWithTimeout(premiumUrl, timeoutMs), "premium index")
    )
  );

  const fundingUrl = new URL("/fapi/v1/fundingRate", baseUrl);
  fundingUrl.searchParams.set("symbol", request.symbol);
  fundingUrl.searchParams.set("limit", String(fundingLimit));
  metrics.push(
    ...expectArray<BinanceFundingRate>(await fetchJsonWithTimeout(fundingUrl, timeoutMs), "funding history").map((item) =>
      normalizeFundingRate(request.symbol, request.period, item)
    )
  );

  const openInterestUrl = new URL("/fapi/v1/openInterest", baseUrl);
  openInterestUrl.searchParams.set("symbol", request.symbol);
  metrics.push(
    normalizeOpenInterest(
      request.symbol,
      request.period,
      expectObject<BinanceOpenInterest>(await fetchJsonWithTimeout(openInterestUrl, timeoutMs), "open interest")
    )
  );

  const openInterestHistUrl = new URL("/futures/data/openInterestHist", baseUrl);
  openInterestHistUrl.searchParams.set("symbol", request.symbol);
  openInterestHistUrl.searchParams.set("period", request.period);
  openInterestHistUrl.searchParams.set("limit", String(historyLimit));
  metrics.push(
    ...expectArray<BinanceOpenInterestHist>(
      await fetchJsonWithTimeout(openInterestHistUrl, timeoutMs),
      "open interest history"
    ).map((item) => normalizeOpenInterestHist(request.symbol, request.period, item))
  );

  const longShortUrl = new URL("/futures/data/globalLongShortAccountRatio", baseUrl);
  longShortUrl.searchParams.set("symbol", request.symbol);
  longShortUrl.searchParams.set("period", request.period);
  longShortUrl.searchParams.set("limit", String(historyLimit));
  metrics.push(
    ...expectArray<BinanceLongShortRatio>(await fetchJsonWithTimeout(longShortUrl, timeoutMs), "long short ratio").map(
      (item) => normalizeLongShortRatio(request.symbol, request.period, item)
    )
  );

  const basisUrl = new URL("/futures/data/basis", baseUrl);
  basisUrl.searchParams.set("pair", request.symbol);
  basisUrl.searchParams.set("contractType", "PERPETUAL");
  basisUrl.searchParams.set("period", request.period);
  basisUrl.searchParams.set("limit", String(historyLimit));
  metrics.push(
    ...expectArray<BinanceBasis>(await fetchJsonWithTimeout(basisUrl, timeoutMs), "basis").map((item) =>
      normalizeBasis(request.symbol, request.period, item)
    )
  );

  return {
    symbol: request.symbol,
    period: request.period,
    metrics
  };
}
