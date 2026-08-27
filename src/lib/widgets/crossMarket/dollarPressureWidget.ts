import { getCorrelationPair } from "../marketContext";
import type { WidgetEngine } from "../types";
import { clamp, round } from "../crypto/helpers";
import {
  DEFAULT_CROSS_MARKET_TIMEFRAME,
  coverageConfidence,
  getTrendSignal,
  latestUpdatedAt,
  missingWarnings,
  normalizedScore,
  scoreSeverity,
  signalDetails,
  sourceRefs,
  trendValue
} from "./helpers";

export const dollarPressureWidget: WidgetEngine = {
  id: "dollar_pressure",
  name: "Dollar Pressure",
  description: "Evaluates whether dollar strength is pressuring crypto, equities, or gold.",
  requiredInputs: ["marketContext.assetCandles", "marketContext.correlations"],
  async run(context) {
    const timeframe = context.timeframe ?? DEFAULT_CROSS_MARKET_TIMEFRAME;
    const dxy = getTrendSignal(context, "DXY", timeframe);
    const btc = getTrendSignal(context, "BTCUSDT", timeframe);
    const nasdaq = getTrendSignal(context, "NASDAQ100", timeframe);
    const gold = getTrendSignal(context, "XAUUSD", timeframe);
    const signals = [dxy, btc, nasdaq, gold];
    const btcDxy = getCorrelationPair(context.marketContext, "btc_dxy");
    const goldDxy = getCorrelationPair(context.marketContext, "gold_dxy");
    const dxyDirection = trendValue(dxy.trend);
    const riskAssetWeakness = [btc, nasdaq].filter((signal) => signal.trend === "bearish").length;
    const goldWeakness = gold.trend === "bearish" ? 1 : 0;
    const inverseCryptoPressure =
      btcDxy?.latestCorrelation !== null && btcDxy?.latestCorrelation !== undefined && btcDxy.latestCorrelation < -0.35
        ? 8
        : 0;
    const rawScore =
      50 +
      dxyDirection * 28 +
      riskAssetWeakness * 9 +
      goldWeakness * 5 +
      inverseCryptoPressure -
      (dxy.trend === "bearish" ? 18 : 0);
    const score = normalizedScore(rawScore);
    const direction =
      score >= 70
        ? "high_dollar_pressure"
        : score >= 58
          ? "moderate_dollar_pressure"
          : score <= 38
            ? "dollar_pressure_easing"
            : "mixed";
    const conflictPenalty = dxy.trend === "bullish" && riskAssetWeakness === 0 ? 0.08 : 0;
    const confidence = coverageConfidence(signals, conflictPenalty);
    const updatedAt = latestUpdatedAt(signals, context.now);
    const drivers = [
      dxy.trend === "bullish" ? "DXY is trending higher" : dxy.trend === "bearish" ? "DXY is easing" : "DXY trend is mixed",
      `${riskAssetWeakness} of 2 risk assets are bearish`,
      gold.trend === "bearish" ? "Gold is not absorbing dollar pressure" : "Gold is not clearly weak",
      btcDxy?.latestCorrelation !== null && btcDxy?.latestCorrelation !== undefined
        ? `BTC/DXY correlation is ${round(btcDxy.latestCorrelation, 2)}`
        : "BTC/DXY correlation is unavailable"
    ];

    return {
      widgetId: this.id,
      symbol: context.symbol,
      timeframe,
      score,
      direction,
      confidence,
      severity: scoreSeverity(score),
      summary: `Dollar pressure is ${direction.replaceAll("_", " ")} with a ${score}/100 pressure score.`,
      details: {
        scoreMeaning: "Higher scores mean stronger dollar-led pressure on risk assets.",
        assets: {
          DXY: signalDetails(dxy),
          BTCUSDT: signalDetails(btc),
          NASDAQ100: signalDetails(nasdaq),
          XAUUSD: signalDetails(gold)
        },
        correlations: {
          btcDxyLatest: btcDxy?.latestCorrelation ?? null,
          goldDxyLatest: goldDxy?.latestCorrelation ?? null
        },
        drivers,
        warnings: missingWarnings(signals),
        rawScore: round(clamp(rawScore, 0, 100), 2)
      },
      sources: sourceRefs(signals, updatedAt),
      updatedAt
    };
  }
};
