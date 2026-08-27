import type { WidgetEngine } from "../types";
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

export const riskRegimeWidget: WidgetEngine = {
  id: "risk_regime",
  name: "Risk-On / Risk-Off Regime",
  description: "Summarizes the broad cross-market environment into a risk regime state.",
  requiredInputs: ["marketContext.assetCandles"],
  async run(context) {
    const timeframe = context.timeframe ?? DEFAULT_CROSS_MARKET_TIMEFRAME;
    const btc = getTrendSignal(context, "BTCUSDT", timeframe);
    const nasdaq = getTrendSignal(context, "NASDAQ100", timeframe);
    const spx = getTrendSignal(context, "SPX", timeframe);
    const dxy = getTrendSignal(context, "DXY", timeframe);
    const us10y = getTrendSignal(context, "US10Y", timeframe);
    const gold = getTrendSignal(context, "XAUUSD", timeframe);
    const oil = getTrendSignal(context, "WTI", timeframe);
    const signals = [btc, nasdaq, spx, dxy, us10y, gold, oil];
    const riskOnCount = [btc, nasdaq, spx].filter((signal) => signal.trend === "bullish").length;
    const riskOffPressureCount = [dxy, us10y, oil].filter((signal) => signal.trend === "bullish").length;
    const defensiveBid = gold.trend === "bullish";
    const riskWeaknessCount = [btc, nasdaq, spx].filter((signal) => signal.trend === "bearish").length;
    const rawScore = 50 + riskOnCount * 12 - riskWeaknessCount * 10 - riskOffPressureCount * 9 - (defensiveBid ? 4 : 0);
    const score = normalizedScore(rawScore);
    const direction =
      score >= 68
        ? "risk_on"
        : score <= 32
          ? "risk_off"
          : riskOnCount > riskOffPressureCount && score >= 52
            ? "transitioning_to_risk_on"
            : riskOffPressureCount > riskOnCount && score <= 48
              ? "transitioning_to_risk_off"
              : riskOnCount > 0 && riskOffPressureCount > 0
                ? "unstable"
                : "mixed";
    const updatedAt = latestUpdatedAt(signals, context.now);

    return {
      widgetId: this.id,
      symbol: context.symbol,
      timeframe,
      score,
      direction,
      confidence: coverageConfidence(signals),
      severity: direction === "unstable" ? "high" : scoreSeverity(score),
      summary: `Broad market regime is ${direction.replaceAll("_", " ")} with a ${score}/100 risk score.`,
      details: {
        scoreMeaning: "Higher scores indicate more risk-on conditions; lower scores indicate more risk-off pressure.",
        counts: {
          riskOnCount,
          riskWeaknessCount,
          riskOffPressureCount,
          defensiveBid
        },
        assets: {
          BTCUSDT: signalDetails(btc),
          NASDAQ100: signalDetails(nasdaq),
          SPX: signalDetails(spx),
          DXY: signalDetails(dxy),
          US10Y: signalDetails(us10y),
          XAUUSD: signalDetails(gold),
          WTI: signalDetails(oil)
        },
        warnings: missingWarnings(signals)
      },
      sources: sourceRefs(signals, updatedAt),
      updatedAt
    };
  }
};
