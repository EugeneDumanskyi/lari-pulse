import { listCorrelationPairs } from "../marketContext";
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

export const crossMarketDivergenceWidget: WidgetEngine = {
  id: "cross_market_divergence",
  name: "Cross-Market Divergence",
  description: "Identifies unusual situations where related markets stop confirming each other.",
  requiredInputs: ["marketContext.assetCandles", "marketContext.correlations"],
  async run(context) {
    const timeframe = context.timeframe ?? DEFAULT_CROSS_MARKET_TIMEFRAME;
    const btc = getTrendSignal(context, "BTCUSDT", timeframe);
    const nasdaq = getTrendSignal(context, "NASDAQ100", timeframe);
    const gold = getTrendSignal(context, "XAUUSD", timeframe);
    const dxy = getTrendSignal(context, "DXY", timeframe);
    const oil = getTrendSignal(context, "WTI", timeframe);
    const spx = getTrendSignal(context, "SPX", timeframe);
    const signals = [btc, nasdaq, gold, dxy, oil, spx];
    const correlations = listCorrelationPairs(context.marketContext);
    const divergentPairs = correlations.filter(
      (pair) => pair.divergence.direction !== "aligned" && pair.divergence.direction !== "insufficient_data"
    );
    const structuralDivergences = [
      btc.trend === "bullish" && nasdaq.trend === "bearish" ? "BTC rises while Nasdaq weakens" : null,
      gold.trend === "bullish" && dxy.trend === "bullish" ? "Gold rises despite a stronger dollar" : null,
      oil.trend === "bullish" && spx.trend === "bearish" ? "Oil rises while equities weaken" : null,
      dxy.trend === "bullish" && btc.trend === "bullish" ? "DXY rises while BTC ignores dollar pressure" : null,
      nasdaq.trend === "bullish" && btc.trend === "bearish" ? "Nasdaq recovers while BTC remains weak" : null
    ].filter((value): value is string => Boolean(value));
    const score = normalizedScore(35 + divergentPairs.length * 12 + structuralDivergences.length * 13);
    const direction =
      score >= 72
        ? "high_divergence"
        : score >= 55
          ? "moderate_divergence"
          : structuralDivergences.length === 0 && divergentPairs.length === 0
            ? "low_divergence"
            : "mixed_divergence";
    const updatedAt = latestUpdatedAt(signals, context.now);

    return {
      widgetId: this.id,
      symbol: context.symbol,
      timeframe,
      score,
      direction,
      confidence: coverageConfidence(signals, correlations.length === 0 ? 0.12 : 0),
      severity: scoreSeverity(score),
      summary: `Cross-market divergence is ${direction.replaceAll("_", " ")} with ${structuralDivergences.length + divergentPairs.length} divergence flags.`,
      details: {
        scoreMeaning: "Higher scores mean more cross-market relationships are failing to confirm each other.",
        structuralDivergences,
        pairDivergences: divergentPairs.map((pair) => ({
          id: pair.id,
          label: pair.label,
          direction: pair.divergence.direction,
          spread: pair.divergence.spread,
          latestCorrelation: pair.latestCorrelation,
          observations: pair.observations
        })),
        assets: {
          BTCUSDT: signalDetails(btc),
          NASDAQ100: signalDetails(nasdaq),
          SPX: signalDetails(spx),
          XAUUSD: signalDetails(gold),
          DXY: signalDetails(dxy),
          WTI: signalDetails(oil)
        },
        warnings: missingWarnings(signals)
      },
      sources: sourceRefs(signals, updatedAt),
      updatedAt
    };
  }
};
