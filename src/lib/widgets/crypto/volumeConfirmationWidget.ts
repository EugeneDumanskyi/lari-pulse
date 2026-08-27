import {
  averageTrueRange,
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

export const volumeConfirmationWidget: WidgetEngine = {
  id: "volume_confirmation",
  name: "Volume Confirmation",
  description: "Compares recent volume trend with candle direction and range expansion.",
  requiredInputs: ["candles"],
  async run(context) {
    const candles = context.candles ?? [];

    if (candles.length < 25) {
      return insufficientDataResult(this.id, context, "Volume confirmation needs at least 25 candles");
    }

    const latest = getLatestCandle(candles)!;
    const previous = candles[candles.length - 2];
    const volume = volumeTrend(candles, 5, 20, 0.15);
    const atr14 = averageTrueRange(candles, 14)!;
    const candleIsGreen = latest.close >= latest.open;
    const priceChangePct = previous.close === 0 ? 0 : ((latest.close - previous.close) / previous.close) * 100;
    const rangeToAtr = atr14 === 0 ? 0 : (latest.high - latest.low) / atr14;
    const volumeRatio = volume.ratio ?? 1;
    const candleDirection = candleIsGreen ? "green" : "red";
    let confirmationStrength = 35;

    if (volume.direction === "rising") {
      confirmationStrength += 25;
    } else if (volume.direction === "falling") {
      confirmationStrength -= 12;
    }

    if (Math.abs(priceChangePct) > 0.3 && volume.direction === "rising") {
      confirmationStrength += 12;
    }

    if (rangeToAtr > 1.2 && volume.direction === "rising") {
      confirmationStrength += 10;
    }

    if ((priceChangePct > 0 && !candleIsGreen) || (priceChangePct < 0 && candleIsGreen)) {
      confirmationStrength -= 8;
    }

    const score = Math.round(clamp(confirmationStrength, 0, 100));
    let direction = "no_confirmation";

    if (volume.direction === "rising" && score >= 75) {
      direction = "strong_confirmation";
    } else if (volume.direction === "rising" && score >= 58) {
      direction = "moderate_confirmation";
    } else if (volume.direction === "stable" && score >= 45) {
      direction = "weak_confirmation";
    } else if (volume.direction === "falling" && Math.abs(priceChangePct) > 0.3) {
      direction = "conflicting";
    }

    const confidence = round(
      clamp(
        confidenceFromData(candles, 60) +
          (volume.direction === "insufficient_data" ? -0.1 : 0) +
          (Math.abs(priceChangePct) > 0.3 ? 0.05 : 0),
        0.2,
        0.88
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
      summary: `${context.symbol ?? "Asset"} volume shows ${direction.replaceAll("_", " ")} with a ${candleDirection} latest candle.`,
      details: {
        candleDirection,
        priceChangePct: round(priceChangePct),
        volumeTrend: volume.direction,
        recentVolumeAverage: volume.recentAverage === null ? null : round(volume.recentAverage, 4),
        baselineVolumeAverage: volume.baselineAverage === null ? null : round(volume.baselineAverage, 4),
        volumeRatio: round(volumeRatio, 3),
        atr14: round(atr14, 4),
        rangeToAtr: round(rangeToAtr)
      },
      sources: getSourceRefs(context, candles),
      updatedAt: latestUpdatedAt(context, candles)
    };
  }
};
