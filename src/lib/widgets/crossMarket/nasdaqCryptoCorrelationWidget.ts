import { getCorrelationPair } from "../marketContext";
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

const PAIRS = [
  { id: "btc_nasdaq100", label: "BTC / Nasdaq" },
  { id: "eth_nasdaq100", label: "ETH / Nasdaq" },
  { id: "sol_nasdaq100", label: "SOL / Nasdaq" }
];

export const nasdaqCryptoCorrelationWidget: WidgetEngine = {
  id: "nasdaq_crypto_correlation",
  name: "Nasdaq-Crypto Correlation",
  description: "Shows whether major crypto assets are moving with Nasdaq or diverging from it.",
  requiredInputs: ["marketContext.assetCandles", "marketContext.correlations"],
  async run(context) {
    const timeframe = context.timeframe ?? DEFAULT_CROSS_MARKET_TIMEFRAME;
    const btc = getTrendSignal(context, "BTCUSDT", timeframe);
    const eth = getTrendSignal(context, "ETHUSDT", timeframe);
    const sol = getTrendSignal(context, "SOLUSDT", timeframe);
    const nasdaq = getTrendSignal(context, "NASDAQ100", timeframe);
    const signals = [btc, eth, sol, nasdaq];
    const pairResults = PAIRS.map((pair) => ({
      ...pair,
      result: getCorrelationPair(context.marketContext, pair.id)
    }));
    const available = pairResults.filter((pair) => pair.result?.latestCorrelation !== null && pair.result?.latestCorrelation !== undefined);
    const averageCorrelation =
      available.length > 0
        ? available.reduce((total, pair) => total + pair.result!.latestCorrelation!, 0) / available.length
        : null;
    const divergentPairs = pairResults.filter((pair) => pair.result?.divergence.direction !== "aligned" && pair.result?.divergence.direction !== "insufficient_data");
    const cryptoWeakness = [btc, eth, sol].filter((signal) => signal.trend === "bearish").length;
    const cryptoStrength = [btc, eth, sol].filter((signal) => signal.trend === "bullish").length;
    const score = normalizedScore(50 + (averageCorrelation ?? 0) * 35 - divergentPairs.length * 7);
    const direction =
      averageCorrelation !== null && averageCorrelation >= 0.55 && divergentPairs.length === 0
        ? "crypto_equity_linked"
        : divergentPairs.length >= 2
          ? "decoupling"
          : nasdaq.trend === "bearish" && cryptoStrength >= 2
            ? "crypto_outperforming"
            : nasdaq.trend === "bullish" && cryptoWeakness >= 2
              ? "crypto_underperforming"
              : "mixed";
    const updatedAt = latestUpdatedAt(signals, context.now);

    return {
      widgetId: this.id,
      symbol: context.symbol,
      timeframe,
      score,
      direction,
      confidence: coverageConfidence(signals, available.length < 2 ? 0.12 : 0),
      severity: scoreSeverity(score),
      summary: `Nasdaq-crypto correlation is ${direction.replaceAll("_", " ")} with ${available.length} available pair readings.`,
      details: {
        averageCorrelation: averageCorrelation === null ? null : round(averageCorrelation, 3),
        assets: {
          BTCUSDT: signalDetails(btc),
          ETHUSDT: signalDetails(eth),
          SOLUSDT: signalDetails(sol),
          NASDAQ100: signalDetails(nasdaq)
        },
        pairs: Object.fromEntries(
          pairResults.map((pair) => [
            pair.id,
            {
              label: pair.label,
              latestCorrelation: pair.result?.latestCorrelation ?? null,
              observations: pair.result?.observations ?? 0,
              divergence: pair.result?.divergence.direction ?? "unavailable",
              warnings: pair.result?.warnings ?? ["correlation unavailable"]
            }
          ])
        ),
        divergentPairCount: divergentPairs.length,
        warnings: missingWarnings(signals)
      },
      sources: sourceRefs(signals, updatedAt),
      updatedAt
    };
  }
};
