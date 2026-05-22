import {
  movingAverage,
  rsi
} from "@/lib/indicators";
import type { CandleRecord } from "@/lib/db/types";
import type { SourceRef, WidgetEngine } from "../types";
import {
  clamp,
  getLatestCandle,
  getTimeframeCandles,
  insufficientDataResult,
  round,
  severityFromScore,
  trendBiasFromInputs
} from "./helpers";

const DEFAULT_TIMEFRAMES = ["15m", "1h", "4h", "1d"];

function analyzeTimeframe(candles: CandleRecord[]) {
  if (candles.length < 30) {
    return null;
  }

  const latest = getLatestCandle(candles)!;
  const ma7 = movingAverage(candles, 7)!;
  const ma30 = movingAverage(candles, 30)!;
  const rsi14 = rsi(candles, 14)!;
  const bias = trendBiasFromInputs(latest.close, ma7, ma30);

  return {
    latestClose: latest.close,
    ma7,
    ma30,
    rsi14,
    bias,
    updatedAt: new Date(latest.closeTime).toISOString(),
    source: latest.source
  };
}

export const multiTimeframeAlignmentWidget: WidgetEngine = {
  id: "multi_timeframe_alignment",
  name: "Multi-Timeframe Alignment",
  description: "Compares trend and RSI state across the configured crypto timeframes.",
  requiredInputs: ["marketContext.timeframeCandles"],
  async run(context) {
    const timeframeCandles = getTimeframeCandles(context);
    const timeframeKeys = DEFAULT_TIMEFRAMES.filter((timeframe) => timeframeCandles[timeframe]);

    if (timeframeKeys.length < 2) {
      return insufficientDataResult(
        this.id,
        context,
        "Multi-timeframe alignment needs candle data for at least two timeframes"
      );
    }

    const analyses = Object.fromEntries(
      timeframeKeys.map((timeframe) => [timeframe, analyzeTimeframe(timeframeCandles[timeframe])])
    );
    const validEntries = Object.entries(analyses).filter(
      (entry): entry is [string, NonNullable<(typeof analyses)[string]>] => entry[1] !== null
    );

    if (validEntries.length < 2) {
      return insufficientDataResult(
        this.id,
        context,
        "Multi-timeframe alignment needs at least two timeframes with 30 candles"
      );
    }

    const bullishCount = validEntries.filter(([, value]) => value.bias === "bullish").length;
    const bearishCount = validEntries.filter(([, value]) => value.bias === "bearish").length;
    const shortTerm = analyses["15m"] ?? analyses["1h"] ?? null;
    const longTerm = analyses["1d"] ?? analyses["4h"] ?? null;
    const total = validEntries.length;
    let direction = "mixed";

    if (bullishCount >= Math.ceil(total * 0.75)) {
      direction = "bullish_aligned";
    } else if (bearishCount >= Math.ceil(total * 0.75)) {
      direction = "bearish_aligned";
    } else if (longTerm?.bias === "bullish" && shortTerm?.bias === "bearish") {
      direction = "short_term_cooling";
    } else if (longTerm?.bias === "bearish" && shortTerm?.bias === "bullish") {
      direction = "short_term_recovering";
    }

    const alignmentRatio = Math.max(bullishCount, bearishCount) / total;
    const directionalScore =
      direction === "bullish_aligned"
        ? 50 + alignmentRatio * 50
        : direction === "bearish_aligned"
          ? 50 - alignmentRatio * 50
          : direction === "short_term_recovering"
            ? 58
            : direction === "short_term_cooling"
              ? 42
              : 50;
    const score = Math.round(clamp(directionalScore, 0, 100));
    const confidence = round(clamp(0.35 + alignmentRatio * 0.45 + total * 0.03, 0.25, 0.92), 2);
    const updatedAt = validEntries
      .map(([, value]) => value.updatedAt)
      .sort()
      .at(-1)!;
    const sources: SourceRef[] = validEntries.map(([timeframe, value]) => ({
      source: value.source,
      type: "ohlcv",
      symbol: context.symbol,
      timeframe,
      updatedAt: value.updatedAt
    }));

    return {
      widgetId: this.id,
      symbol: context.symbol,
      timeframe: context.timeframe,
      score,
      direction,
      confidence,
      severity: severityFromScore(score),
      summary: `${context.symbol ?? "Asset"} timeframe alignment is ${direction.replaceAll("_", " ")} across ${total} timeframes.`,
      details: {
        bullishCount,
        bearishCount,
        totalTimeframes: total,
        alignmentRatio: round(alignmentRatio, 3),
        timeframes: Object.fromEntries(
          validEntries.map(([timeframe, value]) => [
            timeframe,
            {
              bias: value.bias,
              rsi14: round(value.rsi14, 2),
              latestClose: value.latestClose,
              ma7: round(value.ma7, 4),
              ma30: round(value.ma30, 4)
            }
          ])
        )
      },
      sources,
      updatedAt
    };
  }
};
