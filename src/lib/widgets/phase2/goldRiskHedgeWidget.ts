import type { WidgetEngine } from "../types";
import {
  DEFAULT_PHASE2_TIMEFRAME,
  coverageConfidence,
  getTrendSignal,
  latestUpdatedAt,
  missingWarnings,
  normalizedScore,
  scoreSeverity,
  signalDetails,
  sourceRefs
} from "./helpers";

export const goldRiskHedgeWidget: WidgetEngine = {
  id: "gold_risk_hedge",
  name: "Gold / Risk Hedge Signal",
  description: "Determines whether gold is behaving as a hedge, inflation hedge, or weak defensive asset.",
  requiredInputs: ["marketContext.assetCandles"],
  async run(context) {
    const timeframe = context.timeframe ?? DEFAULT_PHASE2_TIMEFRAME;
    const gold = getTrendSignal(context, "XAUUSD", timeframe);
    const dxy = getTrendSignal(context, "DXY", timeframe);
    const us10y = getTrendSignal(context, "US10Y", timeframe);
    const nasdaq = getTrendSignal(context, "NASDAQ100", timeframe);
    const oil = getTrendSignal(context, "WTI", timeframe);
    const signals = [gold, dxy, us10y, nasdaq, oil];
    const equitiesWeak = nasdaq.trend === "bearish";
    const pressureRising = dxy.trend === "bullish" || us10y.trend === "bullish";
    const inflationImpulse = oil.trend === "bullish" && us10y.trend === "bullish";
    let score = 50;
    let direction = "neutral_hedge";

    if (gold.trend === "bullish" && equitiesWeak) {
      score += 24;
      direction = "risk_hedge_bid";
    }

    if (gold.trend === "bullish" && inflationImpulse) {
      score += 16;
      direction = "inflation_hedge_bid";
    }

    if (gold.trend === "bullish" && pressureRising) {
      score += 10;
      direction = "dollar_yield_resilient";
    }

    if (gold.trend === "bearish") {
      score -= pressureRising ? 24 : 14;
      direction = "weak_hedge";
    }

    const finalScore = normalizedScore(score);
    const updatedAt = latestUpdatedAt(signals, context.now);

    return {
      widgetId: this.id,
      symbol: context.symbol,
      timeframe,
      score: finalScore,
      direction,
      confidence: coverageConfidence(signals),
      severity: scoreSeverity(finalScore),
      summary: `Gold hedge behavior is ${direction.replaceAll("_", " ")} with a ${finalScore}/100 hedge score.`,
      details: {
        scoreMeaning: "Higher scores mean gold is acting more like a useful hedge in current cross-market conditions.",
        assets: {
          XAUUSD: signalDetails(gold),
          DXY: signalDetails(dxy),
          US10Y: signalDetails(us10y),
          NASDAQ100: signalDetails(nasdaq),
          WTI: signalDetails(oil)
        },
        drivers: {
          equitiesWeak,
          pressureRising,
          inflationImpulse
        },
        warnings: missingWarnings(signals)
      },
      sources: sourceRefs(signals, updatedAt),
      updatedAt
    };
  }
};
