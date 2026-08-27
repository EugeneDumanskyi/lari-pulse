import type { WidgetEngine } from "../types";
import { round } from "../crypto/helpers";
import {
  DEFAULT_CROSS_MARKET_TIMEFRAME,
  coverageConfidence,
  getTrendSignal,
  latestUpdatedAt,
  missingWarnings,
  normalizedScore,
  scoreSeverity,
  signalDetails,
  sourceRefs
} from "./helpers";

export const oilInflationPressureWidget: WidgetEngine = {
  id: "oil_inflation_pressure",
  name: "Oil Inflation Pressure",
  description: "Detects whether oil movement is adding inflation pressure or market stress.",
  requiredInputs: ["marketContext.assetCandles"],
  async run(context) {
    const timeframe = context.timeframe ?? DEFAULT_CROSS_MARKET_TIMEFRAME;
    const oil = getTrendSignal(context, "WTI", timeframe);
    const us10y = getTrendSignal(context, "US10Y", timeframe);
    const dxy = getTrendSignal(context, "DXY", timeframe);
    const nasdaq = getTrendSignal(context, "NASDAQ100", timeframe);
    const gold = getTrendSignal(context, "XAUUSD", timeframe);
    const signals = [oil, us10y, dxy, nasdaq, gold];
    const oilVolatility = oil.volatility20Pct ?? 0;
    const equityStress = nasdaq.trend === "bearish";
    const yieldConfirmation = us10y.trend === "bullish";
    const dollarConfirmation = dxy.trend === "bullish";
    const hedgeConfirmation = gold.trend === "bullish";
    const rawScore =
      50 +
      (oil.trend === "bullish" ? 24 : oil.trend === "bearish" ? -18 : 0) +
      (yieldConfirmation ? 10 : 0) +
      (dollarConfirmation ? 7 : 0) +
      (equityStress ? 8 : 0) +
      (hedgeConfirmation ? 5 : 0) +
      Math.min(oilVolatility * 2, 10);
    const score = normalizedScore(rawScore);
    const direction =
      score >= 72
        ? "inflation_pressure"
        : score >= 60
          ? "stress_pressure"
          : score <= 40
            ? "pressure_easing"
            : "mixed";
    const updatedAt = latestUpdatedAt(signals, context.now);

    return {
      widgetId: this.id,
      symbol: context.symbol,
      timeframe,
      score,
      direction,
      confidence: coverageConfidence(signals),
      severity: scoreSeverity(score),
      summary: `Oil pressure is ${direction.replaceAll("_", " ")} with a ${score}/100 pressure score.`,
      details: {
        scoreMeaning: "Higher scores mean oil is adding inflation or stress pressure.",
        assets: {
          WTI: signalDetails(oil),
          US10Y: signalDetails(us10y),
          DXY: signalDetails(dxy),
          NASDAQ100: signalDetails(nasdaq),
          XAUUSD: signalDetails(gold)
        },
        confirmations: {
          yieldConfirmation,
          dollarConfirmation,
          equityStress,
          hedgeConfirmation,
          oilVolatility20Pct: round(oilVolatility, 2)
        },
        warnings: missingWarnings(signals)
      },
      sources: sourceRefs(signals, updatedAt),
      updatedAt
    };
  }
};
