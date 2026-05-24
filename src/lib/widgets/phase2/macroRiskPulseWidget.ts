import { movingAverage } from "@/lib/indicators";
import type { CandleRecord } from "@/lib/db/types";
import { getAssetCandles, getCorrelationPair, listCorrelationPairs } from "../marketContext";
import type { SourceRef, WidgetEngine, WidgetSeverity } from "../types";
import { clamp, round } from "../phase1/helpers";

type MacroAssetSymbol = "BTCUSDT" | "DXY" | "US10Y" | "NASDAQ100" | "SPX" | "XAUUSD" | "WTI";
type MacroTrend = "bullish" | "bearish" | "mixed" | "insufficient_data";
type MacroDirection = "risk_on" | "risk_off_pressure" | "mixed" | "transitioning" | "unstable";

interface MacroAssetConfig {
  symbol: MacroAssetSymbol;
  label: string;
  role: "risk_asset" | "pressure" | "defensive";
  weight: number;
}

interface MacroAssetSignal {
  symbol: MacroAssetSymbol;
  label: string;
  role: MacroAssetConfig["role"];
  trend: MacroTrend;
  contribution: number;
  latestClose: number | null;
  ma5: number | null;
  ma20: number | null;
  change5Pct: number | null;
  candleCount: number;
  updatedAt: string | null;
  source: string | null;
}

const DEFAULT_TIMEFRAME = "1d";
const REQUIRED_CANDLES = 20;

const MACRO_ASSETS: MacroAssetConfig[] = [
  { symbol: "BTCUSDT", label: "BTC", role: "risk_asset", weight: 1.2 },
  { symbol: "NASDAQ100", label: "Nasdaq 100", role: "risk_asset", weight: 1.15 },
  { symbol: "SPX", label: "S&P 500", role: "risk_asset", weight: 1 },
  { symbol: "DXY", label: "Dollar index", role: "pressure", weight: 1.1 },
  { symbol: "US10Y", label: "US 10Y yield", role: "pressure", weight: 1 },
  { symbol: "XAUUSD", label: "Gold", role: "defensive", weight: 0.55 },
  { symbol: "WTI", label: "WTI oil", role: "pressure", weight: 0.45 }
];

function latestCandle(candles: CandleRecord[]) {
  return candles.length > 0 ? candles[candles.length - 1] : null;
}

function trendFromCandles(candles: CandleRecord[]): Omit<MacroAssetSignal, "symbol" | "label" | "role" | "contribution"> {
  if (candles.length < REQUIRED_CANDLES) {
    const latest = latestCandle(candles);

    return {
      trend: "insufficient_data",
      latestClose: latest?.close ?? null,
      ma5: null,
      ma20: null,
      change5Pct: null,
      candleCount: candles.length,
      updatedAt: latest ? new Date(latest.closeTime).toISOString() : null,
      source: latest?.source ?? null
    };
  }

  const latest = latestCandle(candles)!;
  const previous5 = candles.at(-6);
  const ma5 = movingAverage(candles, 5)!;
  const ma20 = movingAverage(candles, 20)!;
  const change5Pct = previous5 ? ((latest.close - previous5.close) / previous5.close) * 100 : 0;
  let trend: MacroTrend = "mixed";

  if (latest.close > ma20 && ma5 > ma20 && change5Pct > 0) {
    trend = "bullish";
  } else if (latest.close < ma20 && ma5 < ma20 && change5Pct < 0) {
    trend = "bearish";
  }

  return {
    trend,
    latestClose: latest.close,
    ma5,
    ma20,
    change5Pct,
    candleCount: candles.length,
    updatedAt: new Date(latest.closeTime).toISOString(),
    source: latest.source
  };
}

function contributionFor(config: MacroAssetConfig, trend: MacroTrend) {
  if (trend === "mixed" || trend === "insufficient_data") {
    return 0;
  }

  const direction = trend === "bullish" ? 1 : -1;

  if (config.role === "risk_asset") {
    return direction * config.weight;
  }

  return -direction * config.weight;
}

function severityFromDirection(direction: MacroDirection, score: number): WidgetSeverity {
  if (direction === "unstable" || score >= 72 || score <= 28) {
    return "high";
  }

  if (direction === "risk_on" || direction === "risk_off_pressure" || direction === "transitioning") {
    return "medium";
  }

  return "low";
}

function directionFromScore(score: number, conflictRatio: number, mixedRatio: number): MacroDirection {
  if (conflictRatio >= 0.38 && score > 42 && score < 58) {
    return "unstable";
  }

  if (score >= 63) {
    return "risk_on";
  }

  if (score <= 37) {
    return "risk_off_pressure";
  }

  if (mixedRatio >= 0.35 || Math.abs(score - 50) <= 6) {
    return "transitioning";
  }

  return "mixed";
}

function summaryFor(direction: MacroDirection, score: number) {
  if (direction === "risk_on") {
    return `Macro risk pulse is risk-on with a ${score}/100 environment score.`;
  }

  if (direction === "risk_off_pressure") {
    return `Macro risk pulse shows risk-off pressure with a ${score}/100 environment score.`;
  }

  if (direction === "unstable") {
    return `Macro risk pulse is unstable because cross-market signals are strongly split.`;
  }

  if (direction === "transitioning") {
    return `Macro risk pulse is transitioning with no clean risk-on or risk-off consensus.`;
  }

  return `Macro risk pulse is mixed with a ${score}/100 environment score.`;
}

function buildSources(signals: MacroAssetSignal[], updatedAt: string): SourceRef[] {
  const candleSources = signals
    .filter((signal) => signal.updatedAt && signal.source)
    .map((signal) => ({
      source: signal.source!,
      type: "ohlcv",
      symbol: signal.symbol,
      timeframe: DEFAULT_TIMEFRAME,
      updatedAt: signal.updatedAt!
    }));

  return [
    ...candleSources,
    {
      source: "internal",
      type: "macro_risk_pulse",
      timeframe: DEFAULT_TIMEFRAME,
      updatedAt
    }
  ];
}

export const macroRiskPulseWidget: WidgetEngine = {
  id: "macro_risk_pulse",
  name: "Macro Risk Pulse",
  description: "Combines crypto, equity, dollar, yield, gold, and oil trends into a risk-on/risk-off interpretation.",
  requiredInputs: [
    "marketContext.assetCandles",
    "marketContext.correlations"
  ],
  async run(context) {
    const timeframe = context.timeframe ?? DEFAULT_TIMEFRAME;
    const signals = MACRO_ASSETS.map((config): MacroAssetSignal => {
      const candles = getAssetCandles(context.marketContext, config.symbol, timeframe);
      const trend = trendFromCandles(candles);

      return {
        symbol: config.symbol,
        label: config.label,
        role: config.role,
        contribution: contributionFor(config, trend.trend),
        ...trend
      };
    });
    const validSignals = signals.filter((signal) => signal.trend !== "insufficient_data");
    const totalWeight = MACRO_ASSETS.reduce((total, asset) => total + asset.weight, 0);
    const contributionTotal = signals.reduce((total, signal) => total + signal.contribution, 0);
    const score = Math.round(clamp(50 + (contributionTotal / totalWeight) * 50, 0, 100));
    const riskOnSignals = signals.filter((signal) => signal.contribution > 0);
    const riskOffSignals = signals.filter((signal) => signal.contribution < 0);
    const conflictingWeight = Math.min(
      riskOnSignals.reduce((total, signal) => total + Math.abs(signal.contribution), 0),
      riskOffSignals.reduce((total, signal) => total + Math.abs(signal.contribution), 0)
    );
    const conflictRatio = totalWeight === 0 ? 0 : conflictingWeight / totalWeight;
    const mixedRatio = signals.filter((signal) => signal.trend === "mixed").length / MACRO_ASSETS.length;
    const direction = directionFromScore(score, conflictRatio, mixedRatio);
    const coverageRatio = validSignals.length / MACRO_ASSETS.length;
    const correlationPairs = listCorrelationPairs(context.marketContext);
    const btcNasdaq = getCorrelationPair(context.marketContext, "btc_nasdaq100");
    const btcDxy = getCorrelationPair(context.marketContext, "btc_dxy");
    const confidence = round(
      clamp(0.25 + coverageRatio * 0.38 + (1 - conflictRatio) * 0.22 + correlationPairs.length * 0.01, 0.2, 0.88),
      2
    );
    const updatedAt =
      signals
        .map((signal) => signal.updatedAt)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? context.now.toISOString();
    const warnings = signals
      .filter((signal) => signal.trend === "insufficient_data")
      .map((signal) => `${signal.symbol} has ${signal.candleCount} candles; ${REQUIRED_CANDLES} required`);
    const drivers = [
      ...riskOnSignals
        .sort((left, right) => Math.abs(right.contribution) - Math.abs(left.contribution))
        .slice(0, 3)
        .map((signal) => `${signal.label} supports risk-on conditions`),
      ...riskOffSignals
        .sort((left, right) => Math.abs(right.contribution) - Math.abs(left.contribution))
        .slice(0, 3)
        .map((signal) => `${signal.label} adds risk-off pressure`)
    ].slice(0, 5);
    const conflicts =
      riskOnSignals.length > 0 && riskOffSignals.length > 0
        ? [
            `${riskOnSignals.length} risk-on inputs conflict with ${riskOffSignals.length} risk-off inputs`
          ]
        : [];

    if (btcNasdaq?.latestCorrelation !== null && btcNasdaq?.latestCorrelation !== undefined) {
      drivers.push(`BTC/Nasdaq correlation is ${round(btcNasdaq.latestCorrelation, 2)}`);
    }

    if (btcDxy?.latestCorrelation !== null && btcDxy?.latestCorrelation !== undefined) {
      drivers.push(`BTC/DXY correlation is ${round(btcDxy.latestCorrelation, 2)}`);
    }

    return {
      widgetId: this.id,
      symbol: context.symbol,
      timeframe,
      score,
      direction,
      confidence,
      severity: severityFromDirection(direction, score),
      summary: summaryFor(direction, score),
      details: {
        scoreMeaning: "0 is strongest risk-off pressure; 100 is strongest risk-on environment.",
        assets: Object.fromEntries(
          signals.map((signal) => [
            signal.symbol,
            {
              label: signal.label,
              role: signal.role,
              trend: signal.trend,
              contribution: round(signal.contribution, 3),
              latestClose: signal.latestClose,
              ma5: signal.ma5 === null ? null : round(signal.ma5, 4),
              ma20: signal.ma20 === null ? null : round(signal.ma20, 4),
              change5Pct: signal.change5Pct === null ? null : round(signal.change5Pct, 2),
              candleCount: signal.candleCount
            }
          ])
        ),
        drivers,
        conflicts,
        warnings,
        coverageRatio: round(coverageRatio, 3),
        conflictRatio: round(conflictRatio, 3),
        correlations: {
          btcNasdaqLatest: btcNasdaq?.latestCorrelation ?? null,
          btcDxyLatest: btcDxy?.latestCorrelation ?? null,
          pairCount: correlationPairs.length
        }
      },
      sources: buildSources(signals, updatedAt),
      updatedAt
    };
  }
};
