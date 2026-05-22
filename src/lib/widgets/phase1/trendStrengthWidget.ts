import {
  candleStructure,
  movingAverage
} from "@/lib/indicators";
import type { WidgetEngine } from "../types";
import {
  clamp,
  confidenceFromData,
  getLatestCandle,
  getSourceRefs,
  insufficientDataResult,
  latestUpdatedAt,
  round,
  severityFromScore,
  trendBiasFromInputs
} from "./helpers";

export const trendStrengthWidget: WidgetEngine = {
  id: "trend_strength",
  name: "Trend Strength",
  description: "Evaluates price position, moving-average alignment, and recent candle structure.",
  requiredInputs: ["candles"],
  async run(context) {
    const candles = context.candles ?? [];

    if (candles.length < 30) {
      return insufficientDataResult(this.id, context, "Trend strength needs at least 30 candles");
    }

    const latest = getLatestCandle(candles)!;
    const ma7 = movingAverage(candles, 7)!;
    const ma30 = movingAverage(candles, 30)!;
    const structure = candleStructure(candles, 5);
    const priceVsMa7 = ((latest.close - ma7) / ma7) * 100;
    const priceVsMa30 = ((latest.close - ma30) / ma30) * 100;
    const maSpread = ((ma7 - ma30) / ma30) * 100;
    const bias = trendBiasFromInputs(latest.close, ma7, ma30);
    let rawScore = 50;

    rawScore += clamp(priceVsMa7 * 4, -12, 12);
    rawScore += clamp(priceVsMa30 * 3, -18, 18);
    rawScore += clamp(maSpread * 5, -18, 18);

    if (structure.features.includes("higher_lows")) {
      rawScore += 7;
    }

    if (structure.features.includes("lower_highs")) {
      rawScore -= 7;
    }

    const score = Math.round(clamp(rawScore, 0, 100));
    const direction = score >= 60 ? "bullish" : score <= 40 ? "bearish" : bias === "neutral" ? "neutral" : "mixed";
    const confidence = round(
      clamp(
        confidenceFromData(candles, 60) +
          (direction !== "mixed" ? 0.08 : -0.08) +
          (structure.primary !== "mixed" ? 0.06 : -0.04),
        0.2,
        0.92
      ),
      2
    );

    return {
      widgetId: this.id,
      symbol: context.symbol,
      timeframe: context.timeframe,
      score,
      direction,
      confidence,
      severity: severityFromScore(score),
      summary: `${context.symbol ?? "Asset"} trend is ${direction} on ${context.timeframe ?? "the selected timeframe"} with price ${priceVsMa30 >= 0 ? "above" : "below"} MA30.`,
      details: {
        latestClose: latest.close,
        ma7: round(ma7, 4),
        ma30: round(ma30, 4),
        priceVsMa7Pct: round(priceVsMa7),
        priceVsMa30Pct: round(priceVsMa30),
        ma7VsMa30Pct: round(maSpread),
        structure: structure.primary,
        structureFeatures: structure.features
      },
      sources: getSourceRefs(context, candles),
      updatedAt: latestUpdatedAt(context, candles)
    };
  }
};
