import {
  averageTrueRange,
  candleStructure,
  movingAverage,
  rsi,
  volumeTrend
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
  severityFromScore
} from "./helpers";

export const momentumExhaustionWidget: WidgetEngine = {
  id: "momentum_exhaustion",
  name: "Momentum Exhaustion",
  description: "Checks RSI, MA distance, candle range, wick behavior, and volume pressure.",
  requiredInputs: ["candles"],
  async run(context) {
    const candles = context.candles ?? [];

    if (candles.length < 30) {
      return insufficientDataResult(this.id, context, "Momentum exhaustion needs at least 30 candles");
    }

    const latest = getLatestCandle(candles)!;
    const ma7 = movingAverage(candles, 7)!;
    const ma30 = movingAverage(candles, 30)!;
    const rsi14 = rsi(candles, 14)!;
    const atr14 = averageTrueRange(candles, 14)!;
    const structure = candleStructure(candles, 5);
    const volume = volumeTrend(candles);
    const distanceFromMa7Pct = ((latest.close - ma7) / ma7) * 100;
    const distanceFromMa30Pct = ((latest.close - ma30) / ma30) * 100;
    const candleRangeToAtr = atr14 === 0 ? 0 : (latest.high - latest.low) / atr14;
    const isBullishContext = latest.close >= ma30;
    const isBearishContext = latest.close < ma30;
    let exhaustionScore = 50;

    if (rsi14 >= 70) {
      exhaustionScore += (rsi14 - 70) * 1.2;
    } else if (rsi14 <= 30) {
      exhaustionScore -= (30 - rsi14) * 1.2;
    }

    exhaustionScore += clamp(distanceFromMa7Pct * 2.5, -16, 16);
    exhaustionScore += clamp(distanceFromMa30Pct * 1.5, -18, 18);

    if (candleRangeToAtr > 1.8) {
      exhaustionScore += isBullishContext ? 8 : -8;
    }

    if (structure.features.includes("upper_wick_rejection")) {
      exhaustionScore += 7;
    }

    if (structure.features.includes("lower_wick_rejection")) {
      exhaustionScore -= 7;
    }

    const score = Math.round(clamp(exhaustionScore, 0, 100));
    let direction = "neutral";

    if (isBullishContext && score >= 68) {
      direction = "bullish_but_overheated";
    } else if (isBullishContext) {
      direction = "healthy_bullish";
    } else if (isBearishContext && score <= 32) {
      direction = "bearish_but_oversold";
    } else if (isBearishContext) {
      direction = "healthy_bearish";
    } else if (volume.direction !== "stable") {
      direction = "mixed";
    }

    const confidence = round(
      clamp(
        confidenceFromData(candles, 60) +
          (rsi14 >= 70 || rsi14 <= 30 ? 0.08 : 0) +
          (volume.direction === "insufficient_data" ? -0.08 : 0),
        0.2,
        0.9
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
      summary: `${context.symbol ?? "Asset"} momentum reads ${direction.replaceAll("_", " ")} with RSI at ${round(rsi14, 1)}.`,
      details: {
        rsi14: round(rsi14, 2),
        ma7: round(ma7, 4),
        ma30: round(ma30, 4),
        distanceFromMa7Pct: round(distanceFromMa7Pct),
        distanceFromMa30Pct: round(distanceFromMa30Pct),
        atr14: round(atr14, 4),
        candleRangeToAtr: round(candleRangeToAtr),
        candleStructure: structure.primary,
        volumeTrend: volume.direction
      },
      sources: getSourceRefs(context, candles),
      updatedAt: latestUpdatedAt(context, candles)
    };
  }
};
