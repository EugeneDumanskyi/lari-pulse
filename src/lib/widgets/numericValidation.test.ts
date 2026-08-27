import assert from "node:assert/strict";
import test from "node:test";
import type { CorrelationPairResult } from "@/lib/correlations/types";
import type { CandleRecord } from "@/lib/db/types";
import { buildCrossMarketContext } from "./marketContext";
import { liquidationsWidget } from "./liquidity";
import { momentumExhaustionWidget } from "./crypto/momentumExhaustionWidget";
import { multiTimeframeAlignmentWidget } from "./crypto/multiTimeframeAlignmentWidget";
import { supportResistanceWidget } from "./crypto/supportResistanceWidget";
import { trendStrengthWidget } from "./crypto/trendStrengthWidget";
import { volumeConfirmationWidget } from "./crypto/volumeConfirmationWidget";
import { crossMarketDivergenceWidget } from "./crossMarket/crossMarketDivergenceWidget";
import { dollarPressureWidget } from "./crossMarket/dollarPressureWidget";
import { goldRiskHedgeWidget } from "./crossMarket/goldRiskHedgeWidget";
import { macroRiskPulseWidget } from "./crossMarket/macroRiskPulseWidget";
import { nasdaqCryptoCorrelationWidget } from "./crossMarket/nasdaqCryptoCorrelationWidget";
import { oilInflationPressureWidget } from "./crossMarket/oilInflationPressureWidget";
import { riskRegimeWidget } from "./crossMarket/riskRegimeWidget";
import type { WidgetLiquidationSummary } from "./types";

const now = new Date("2026-05-26T10:00:00.000Z");

function clampExpected(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function roundExpected(value: number, decimals = 2) {
  const factor = 10 ** decimals;

  return Math.round(value * factor) / factor;
}

function expectedAgeMinutes(timestamp: string, referenceNow = now) {
  const parsed = Date.parse(timestamp);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return roundExpected(Math.max(0, referenceNow.getTime() - parsed) / 60_000, 1);
}

function expectedLiquidationConfidence(input: {
  totalNotionalUsd: number;
  eventCount: number;
  isStale: boolean;
}) {
  const activityConfidence = clampExpected(Math.log10(Math.max(input.totalNotionalUsd, 1)) / 10, 0.18, 0.52);
  const countConfidence = clampExpected(input.eventCount / 40, 0, 0.18);

  return roundExpected(
    clampExpected(0.24 + activityConfidence + countConfidence - (input.isStale ? 0.15 : 0), 0.18, 0.84),
    2
  );
}

function liquidationSummary(overrides: Partial<WidgetLiquidationSummary> = {}): WidgetLiquidationSummary {
  return {
    symbol: "BTCUSDT",
    source: "binance_futures",
    timeframe: "1h",
    fromTime: Date.parse("2026-05-26T09:00:00.000Z"),
    toTime: Date.parse("2026-05-26T09:59:00.000Z"),
    longCount: 6,
    shortCount: 14,
    longNotionalUsd: 1_111_111.2,
    shortNotionalUsd: 4_444_444.8,
    totalNotionalUsd: 5_555_556,
    longLiquidatedUsd: 1_111_111.2,
    shortLiquidatedUsd: 4_444_444.8,
    totalLiquidatedUsd: 5_555_556,
    longShortImbalance: (1_111_111.2 - 4_444_444.8) / 5_555_556,
    eventCount: 20,
    largestLiquidation: {
      id: 1,
      eventId: "largest",
      symbol: "BTCUSDT",
      side: "short_liquidated",
      price: 100_000,
      quantity: 12,
      notionalUsd: 1_200_000,
      timestamp: Date.parse("2026-05-26T09:50:00.000Z"),
      source: "binance_futures"
    },
    topSymbolsByLiquidation: [
      {
        symbol: "BTCUSDT",
        totalLiquidatedUsd: 5_555_556,
        longLiquidatedUsd: 1_111_111.2,
        shortLiquidatedUsd: 4_444_444.8,
        eventCount: 20
      }
    ],
    timeline: [
      {
        fromTime: Date.parse("2026-05-26T09:00:00.000Z"),
        toTime: Date.parse("2026-05-26T09:59:00.000Z"),
        longLiquidatedUsd: 1_111_111.2,
        shortLiquidatedUsd: 4_444_444.8,
        totalLiquidatedUsd: 5_555_556,
        eventCount: 20
      }
    ],
    longShare: 0.3,
    shortShare: 0.7,
    netPressure: "short_liquidations",
    ...overrides
  };
}

function expectedMovingAverage(candles: CandleRecord[], window: number) {
  const values = candles.slice(-window).map((candle) => candle.close);

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function expectedChange5Pct(candles: CandleRecord[]) {
  const latest = candles.at(-1)!;
  const previous5 = candles.at(-6)!;

  return ((latest.close - previous5.close) / previous5.close) * 100;
}

function expectedRsi(candles: CandleRecord[], period = 14) {
  const window = candles.slice(-(period + 1));
  let gains = 0;
  let losses = 0;

  for (let index = 1; index < window.length; index += 1) {
    const delta = window[index].close - window[index - 1].close;

    if (delta > 0) {
      gains += delta;
    } else {
      losses += Math.abs(delta);
    }
  }

  const averageGain = gains / period;
  const averageLoss = losses / period;

  if (averageLoss === 0 && averageGain === 0) {
    return 50;
  }

  if (averageLoss === 0) {
    return 100;
  }

  return 100 - 100 / (1 + averageGain / averageLoss);
}

function expectedAtr(candles: CandleRecord[], period = 14) {
  const ranges = candles.map((candle, index) => {
    const previous = candles[index - 1];

    if (!previous) {
      return candle.high - candle.low;
    }

    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previous.close),
      Math.abs(candle.low - previous.close)
    );
  });

  return ranges.slice(-period).reduce((total, value) => total + value, 0) / period;
}

function expectedVolumeTrend(candles: CandleRecord[], recentPeriod = 5, baselinePeriod = 20, threshold = 0.15) {
  const recent = candles.slice(-recentPeriod);
  const baseline = candles.slice(-(recentPeriod + baselinePeriod), -recentPeriod);
  const recentAverage = recent.reduce((total, candle) => total + candle.volume, 0) / recent.length;
  const baselineAverage = baseline.reduce((total, candle) => total + candle.volume, 0) / baseline.length;
  const ratio = baselineAverage === 0 ? null : recentAverage / baselineAverage;

  return {
    recentAverage,
    baselineAverage,
    ratio,
    direction:
      ratio === null
        ? "insufficient_data"
        : ratio >= 1 + threshold
          ? "rising"
          : ratio <= 1 - threshold
            ? "falling"
            : "stable"
  };
}

function expectedStructure(candles: CandleRecord[], lookback = 5) {
  const sample = candles.slice(-lookback);
  const latest = sample.at(-1)!;
  const range = latest.high - latest.low;
  const body = Math.abs(latest.close - latest.open);
  const upperWick = latest.high - Math.max(latest.open, latest.close);
  const lowerWick = Math.min(latest.open, latest.close) - latest.low;
  const bodyPctOfRange = range === 0 ? 0 : body / range;
  const upperWickPctOfRange = range === 0 ? 0 : upperWick / range;
  const lowerWickPctOfRange = range === 0 ? 0 : lowerWick / range;
  const features: string[] = [];
  const lows = sample.map((candle) => candle.low);
  const highs = sample.map((candle) => candle.high);

  if (lows.every((value, index) => index === 0 || value > lows[index - 1])) {
    features.push("higher_lows");
  }

  if (highs.every((value, index) => index === 0 || value < highs[index - 1])) {
    features.push("lower_highs");
  }

  if (bodyPctOfRange >= 0.65) {
    features.push("large_body");
  }

  if (upperWickPctOfRange >= 0.45 && upperWickPctOfRange > lowerWickPctOfRange) {
    features.push("upper_wick_rejection");
  }

  if (lowerWickPctOfRange >= 0.45 && lowerWickPctOfRange > upperWickPctOfRange) {
    features.push("lower_wick_rejection");
  }

  return {
    primary: features[0] ?? "mixed",
    features: features.length === 0 ? ["mixed"] : features
  };
}

function makeCryptoCandles(
  symbol: string,
  closes: number[],
  overrides: (index: number, close: number) => Partial<CandleRecord> = () => ({})
): CandleRecord[] {
  return closes.map((close, index) => {
    const override = overrides(index, close);
    const open = override.open ?? close - 0.4;
    const high = override.high ?? Math.max(open, close) + 0.8;
    const low = override.low ?? Math.min(open, close) - 0.8;

    return {
      id: index + 1,
      symbol,
      timeframe: "1h",
      openTime: Date.UTC(2026, 4, 24, index),
      closeTime: Date.UTC(2026, 4, 24, index, 59, 59),
      open,
      high,
      low,
      close,
      volume: override.volume ?? 1_000 + index * 10,
      source: "binance",
      createdAt: "2026-05-26T00:00:00.000Z",
      ...override
    };
  });
}

function expectedCrossMarketSignal(candles: CandleRecord[]) {
  const latest = candles.at(-1) ?? null;

  if (candles.length < 20 || !latest) {
    return {
      trend: "insufficient_data",
      latestClose: latest?.close ?? null,
      ma5: null,
      ma20: null,
      change5Pct: null,
      candleCount: candles.length
    };
  }

  const ma5 = expectedMovingAverage(candles, 5);
  const ma20 = expectedMovingAverage(candles, 20);
  const change5Pct = expectedChange5Pct(candles);
  const trend =
    latest.close > ma20 && ma5 > ma20 && change5Pct > 0
      ? "bullish"
      : latest.close < ma20 && ma5 < ma20 && change5Pct < 0
        ? "bearish"
        : "mixed";

  return {
    trend,
    latestClose: latest.close,
    ma5,
    ma20,
    change5Pct,
    candleCount: candles.length
  };
}

function makeCandles(symbol: string, trend: "up" | "down" | "flat", start: number): CandleRecord[] {
  return Array.from({ length: 36 }, (_, index) => {
    const step = trend === "up" ? 1.4 : trend === "down" ? -1.1 : 0;
    const close = start + step * index;
    const open = close - step / 2;

    return {
      id: index + 1,
      symbol,
      timeframe: "1d",
      openTime: Date.UTC(2026, 3, 20 + index),
      closeTime: Date.UTC(2026, 3, 20 + index, 23, 59, 59),
      open,
      high: Math.max(open, close) + 0.5,
      low: Math.min(open, close) - 0.5,
      close,
      volume: 10_000 + index,
      source: symbol.endsWith("USDT") ? "binance" : "fred",
      createdAt: "2026-05-26T00:00:00.000Z"
    };
  });
}

function pair(
  id: string,
  latestCorrelation: number | null,
  divergenceDirection: CorrelationPairResult["divergence"]["direction"] = "aligned"
): CorrelationPairResult {
  return {
    id,
    label: id,
    leftSymbol: id.split("_")[0].toUpperCase(),
    rightSymbol: "NASDAQ100",
    timeframe: "1d",
    observations: latestCorrelation === null ? 0 : 30,
    latestCorrelation,
    rollingCorrelation: [],
    divergence: {
      leftCumulativeReturn: null,
      rightCumulativeReturn: null,
      spread: null,
      absSpread: null,
      direction: divergenceDirection,
      sampleSize: latestCorrelation === null ? 0 : 12
    },
    leftVolatilityAdjustedMovement: {
      latestReturn: null,
      meanReturn: null,
      volatility: null,
      zScore: null,
      sampleSize: 0
    },
    rightVolatilityAdjustedMovement: {
      latestReturn: null,
      meanReturn: null,
      volatility: null,
      zScore: null,
      sampleSize: 0
    },
    updatedAt: "2026-05-26T00:00:00.000Z",
    warnings: latestCorrelation === null ? ["correlation unavailable"] : []
  };
}

test("Liquidations validates notional shares, signed score direction, USD rounding, percentages, and fresh confidence", async () => {
  const summary = liquidationSummary();
  const shortShare = summary.shortLiquidatedUsd / summary.totalLiquidatedUsd;
  const longShare = summary.longLiquidatedUsd / summary.totalLiquidatedUsd;
  const expectedScore = Math.round(clampExpected(50 + (shortShare - longShare) * 42, 0, 100));

  const result = await liquidationsWidget.run({
    symbol: "BTCUSDT",
    timeframe: "1h",
    marketContext: {
      liquidity: {
        liquidationSummaries: {
          BTCUSDT: {
            "1h": summary
          }
        }
      }
    },
    now
  });

  assert.equal(result.score, expectedScore);
  assert.equal(result.direction, "short_liquidations_dominant");
  assert.equal(result.details.longLiquidationUsd, 1_111_111);
  assert.equal(result.details.shortLiquidationUsd, 4_444_445);
  assert.equal(result.details.totalLiquidationUsd, 5_555_556);
  assert.equal(result.details.longNotionalSharePct, roundExpected(longShare * 100, 1));
  assert.equal(result.details.shortNotionalSharePct, roundExpected(shortShare * 100, 1));
  assert.equal(result.details.ageMinutes, expectedAgeMinutes(new Date(summary.toTime).toISOString()));
  assert.equal(
    result.confidence,
    expectedLiquidationConfidence({
      totalNotionalUsd: summary.totalNotionalUsd,
      eventCount: summary.longCount + summary.shortCount,
      isStale: false
    })
  );
});

test("Liquidations handles negative-side pressure, zero activity, missing summaries, and stale partial data", async () => {
  const longFlush = liquidationSummary({
    toTime: Date.parse("2026-05-26T09:40:00.000Z"),
    longCount: 7,
    shortCount: 1,
    longNotionalUsd: 8_000_000,
    shortNotionalUsd: 2_000_000,
    totalNotionalUsd: 10_000_000,
    longLiquidatedUsd: 8_000_000,
    shortLiquidatedUsd: 2_000_000,
    totalLiquidatedUsd: 10_000_000,
    longShortImbalance: 0.6,
    eventCount: 8,
    netPressure: "long_liquidations"
  });
  const expectedLongFlushScore = Math.round(clampExpected(50 + (0.2 - 0.8) * 42, 0, 100));

  const longFlushResult = await liquidationsWidget.run({
    symbol: "BTCUSDT",
    timeframe: "1h",
    marketContext: {
      liquidity: {
        liquidationSummaries: {
          BTCUSDT: {
            "1h": longFlush
          }
        }
      }
    },
    now
  });

  assert.equal(longFlushResult.score, expectedLongFlushScore);
  assert.equal(longFlushResult.direction, "long_liquidations_dominant");
  assert.equal(longFlushResult.details.isStale, true);
  assert.equal(
    longFlushResult.confidence,
    expectedLiquidationConfidence({
      totalNotionalUsd: 10_000_000,
      eventCount: 8,
      isStale: true
    })
  );

  const quiet = liquidationSummary({
    longCount: 0,
    shortCount: 0,
    longNotionalUsd: 0,
    shortNotionalUsd: 0,
    totalNotionalUsd: 0,
    longLiquidatedUsd: 0,
    shortLiquidatedUsd: 0,
    totalLiquidatedUsd: 0,
    longShortImbalance: 0,
    eventCount: 0,
    largestLiquidation: null,
    topSymbolsByLiquidation: [],
    timeline: [],
    netPressure: "balanced"
  });
  const quietResult = await liquidationsWidget.run({
    symbol: "BTCUSDT",
    timeframe: "1h",
    marketContext: {
      liquidity: {
        liquidationSummaries: {
          BTCUSDT: {
            "1h": quiet
          }
        }
      }
    },
    now
  });

  assert.equal(quietResult.score, 50);
  assert.equal(quietResult.direction, "collecting_from_now");
  assert.equal(quietResult.details.longNotionalSharePct, 0);
  assert.equal(quietResult.details.shortNotionalSharePct, 0);
  assert.equal(quietResult.details.totalLiquidationUsd, 0);

  const missingResult = await liquidationsWidget.run({
    symbol: "BTCUSDT",
    timeframe: "1h",
    marketContext: {
      liquidity: {
        liquidationSummaries: {
          BTCUSDT: {}
        }
      }
    },
    now
  });

  assert.equal(missingResult.score, 50);
  assert.equal(missingResult.direction, "unknown");
  assert.equal(missingResult.confidence, 0.18);
  assert.equal(missingResult.details.reason, "No observed liquidation-event summary");
});

test("Nasdaq-Crypto Correlation validates average correlation, divergent penalties, trend detail rounding, and confidence", async () => {
  const assetCandles = {
    BTCUSDT: { "1d": makeCandles("BTCUSDT", "up", 65_000) },
    ETHUSDT: { "1d": makeCandles("ETHUSDT", "up", 3_000) },
    SOLUSDT: { "1d": makeCandles("SOLUSDT", "up", 160) },
    NASDAQ100: { "1d": makeCandles("NASDAQ100", "up", 18_000) }
  };
  const correlations = [
    pair("btc_nasdaq100", 0.612),
    pair("eth_nasdaq100", -0.2, "left_outperforming"),
    pair("sol_nasdaq100", 0.75)
  ];
  const expectedAverage = (0.612 - 0.2 + 0.75) / 3;
  const expectedScore = Math.round(clampExpected(50 + expectedAverage * 35 - 7, 0, 100));

  const result = await nasdaqCryptoCorrelationWidget.run({
    symbol: "BTCUSDT",
    timeframe: "1d",
    marketContext: buildCrossMarketContext({
      assetCandles,
      correlations
    }),
    now
  });

  const btcCandles = assetCandles.BTCUSDT["1d"];

  assert.equal(result.score, expectedScore);
  assert.equal(result.direction, "mixed");
  assert.equal(result.confidence, 0.75);
  assert.equal(result.details.averageCorrelation, roundExpected(expectedAverage, 3));
  assert.equal(result.details.divergentPairCount, 1);
  assert.equal((result.details.assets as Record<string, Record<string, unknown>>).BTCUSDT.ma5, roundExpected(expectedMovingAverage(btcCandles, 5), 4));
  assert.equal((result.details.assets as Record<string, Record<string, unknown>>).BTCUSDT.ma20, roundExpected(expectedMovingAverage(btcCandles, 20), 4));
  assert.equal((result.details.assets as Record<string, Record<string, unknown>>).BTCUSDT.change5Pct, roundExpected(expectedChange5Pct(btcCandles), 2));
  assert.equal((result.details.pairs as Record<string, Record<string, unknown>>).eth_nasdaq100.latestCorrelation, -0.2);
  assert.equal((result.details.pairs as Record<string, Record<string, unknown>>).eth_nasdaq100.divergence, "left_outperforming");
});

test("Nasdaq-Crypto Correlation handles negative correlations, missing pair data, invalid null correlations, and insufficient candle coverage", async () => {
  const fullAssetCandles = {
    BTCUSDT: { "1d": makeCandles("BTCUSDT", "up", 65_000) },
    ETHUSDT: { "1d": makeCandles("ETHUSDT", "down", 3_000) },
    SOLUSDT: { "1d": makeCandles("SOLUSDT", "down", 160) },
    NASDAQ100: { "1d": makeCandles("NASDAQ100", "up", 18_000) }
  };
  const decoupling = await nasdaqCryptoCorrelationWidget.run({
    symbol: "BTCUSDT",
    timeframe: "1d",
    marketContext: buildCrossMarketContext({
      assetCandles: fullAssetCandles,
      correlations: [
        pair("btc_nasdaq100", -0.4, "left_outperforming"),
        pair("eth_nasdaq100", -0.3, "right_outperforming"),
        pair("sol_nasdaq100", -0.2)
      ]
    }),
    now
  });

  assert.equal(decoupling.details.averageCorrelation, -0.3);
  assert.equal(decoupling.details.divergentPairCount, 2);
  assert.equal(decoupling.score, Math.round(clampExpected(50 + -0.3 * 35 - 14, 0, 100)));
  assert.equal(decoupling.direction, "decoupling");

  const partial = await nasdaqCryptoCorrelationWidget.run({
    symbol: "BTCUSDT",
    timeframe: "1d",
    marketContext: buildCrossMarketContext({
      assetCandles: {
        BTCUSDT: { "1d": makeCandles("BTCUSDT", "up", 65_000) },
        ETHUSDT: { "1d": makeCandles("ETHUSDT", "flat", 3_000).slice(0, 8) },
        SOLUSDT: { "1d": [] },
        NASDAQ100: { "1d": makeCandles("NASDAQ100", "up", 18_000) }
      },
      correlations: [
        pair("btc_nasdaq100", null),
        pair("eth_nasdaq100", null),
        pair("sol_nasdaq100", null)
      ]
    }),
    now
  });

  assert.equal(partial.details.averageCorrelation, null);
  assert.equal(partial.score, 50);
  assert.equal(partial.confidence, 0.41);
  assert.deepEqual(partial.details.warnings, [
    "ETHUSDT has 8 candles; 20 required",
    "SOLUSDT has 0 candles; 20 required"
  ]);
  assert.equal((partial.details.pairs as Record<string, Record<string, unknown>>).btc_nasdaq100.latestCorrelation, null);
  assert.equal((partial.details.pairs as Record<string, Record<string, unknown>>).btc_nasdaq100.warnings instanceof Array, true);
});

test("Trend Strength validates MA distance score, structure bias, rounding, and insufficient data state", async () => {
  const candles = makeCryptoCandles("BTCUSDT", Array.from({ length: 60 }, (_, index) => 100 + index * 1.25));
  const latest = candles.at(-1)!;
  const ma7 = expectedMovingAverage(candles, 7);
  const ma30 = expectedMovingAverage(candles, 30);
  const structure = expectedStructure(candles);
  const priceVsMa7 = ((latest.close - ma7) / ma7) * 100;
  const priceVsMa30 = ((latest.close - ma30) / ma30) * 100;
  const maSpread = ((ma7 - ma30) / ma30) * 100;
  const rawScore =
    50 +
    clampExpected(priceVsMa7 * 4, -12, 12) +
    clampExpected(priceVsMa30 * 3, -18, 18) +
    clampExpected(maSpread * 5, -18, 18) +
    (structure.features.includes("higher_lows") ? 7 : 0) -
    (structure.features.includes("lower_highs") ? 7 : 0);

  const result = await trendStrengthWidget.run({ symbol: "BTCUSDT", timeframe: "1h", candles, now });

  assert.equal(result.score, Math.round(clampExpected(rawScore, 0, 100)));
  assert.equal(result.direction, "bullish");
  assert.equal(result.details.ma7, roundExpected(ma7, 4));
  assert.equal(result.details.ma30, roundExpected(ma30, 4));
  assert.equal(result.details.priceVsMa7Pct, roundExpected(priceVsMa7));
  assert.equal(result.details.priceVsMa30Pct, roundExpected(priceVsMa30));
  assert.equal(result.details.ma7VsMa30Pct, roundExpected(maSpread));
  assert.equal(result.confidence, 0.92);

  const insufficient = await trendStrengthWidget.run({
    symbol: "BTCUSDT",
    timeframe: "1h",
    candles: candles.slice(0, 29),
    now
  });

  assert.equal(insufficient.score, 50);
  assert.equal(insufficient.direction, "mixed");
  assert.equal(insufficient.confidence, 0.2);
  assert.equal(insufficient.details.candleCount, 29);
});

test("Momentum Exhaustion validates RSI, ATR range ratio, distance scoring, wick signs, and flat edge cases", async () => {
  const closes = Array.from({ length: 60 }, (_, index) => 100 + index * 1.1);
  const candles = makeCryptoCandles("BTCUSDT", closes, (index, close) =>
    index === closes.length - 1
      ? { open: close - 4, high: close + 12, low: close - 1, close, volume: 2_500 }
      : { volume: 1_000 + index * 20 }
  );
  const latest = candles.at(-1)!;
  const ma7 = expectedMovingAverage(candles, 7);
  const ma30 = expectedMovingAverage(candles, 30);
  const rsi14 = expectedRsi(candles);
  const atr14 = expectedAtr(candles);
  const distanceFromMa7Pct = ((latest.close - ma7) / ma7) * 100;
  const distanceFromMa30Pct = ((latest.close - ma30) / ma30) * 100;
  const candleRangeToAtr = (latest.high - latest.low) / atr14;
  const structure = expectedStructure(candles);
  let exhaustionScore = 50;

  exhaustionScore += rsi14 >= 70 ? (rsi14 - 70) * 1.2 : 0;
  exhaustionScore += rsi14 <= 30 ? -(30 - rsi14) * 1.2 : 0;
  exhaustionScore += clampExpected(distanceFromMa7Pct * 2.5, -16, 16);
  exhaustionScore += clampExpected(distanceFromMa30Pct * 1.5, -18, 18);
  exhaustionScore += candleRangeToAtr > 1.8 ? 8 : 0;
  exhaustionScore += structure.features.includes("upper_wick_rejection") ? 7 : 0;
  exhaustionScore -= structure.features.includes("lower_wick_rejection") ? 7 : 0;

  const result = await momentumExhaustionWidget.run({ symbol: "BTCUSDT", timeframe: "1h", candles, now });

  assert.equal(result.score, Math.round(clampExpected(exhaustionScore, 0, 100)));
  assert.equal(result.direction, "bullish_but_overheated");
  assert.equal(result.details.rsi14, roundExpected(rsi14, 2));
  assert.equal(result.details.atr14, roundExpected(atr14, 4));
  assert.equal(result.details.candleRangeToAtr, roundExpected(candleRangeToAtr));
  assert.equal(result.details.distanceFromMa7Pct, roundExpected(distanceFromMa7Pct));
  assert.equal(result.details.distanceFromMa30Pct, roundExpected(distanceFromMa30Pct));

  const flat = makeCryptoCandles("BTCUSDT", Array.from({ length: 30 }, () => 100), () => ({
    open: 100,
    high: 100,
    low: 100,
    volume: 0
  }));
  const flatResult = await momentumExhaustionWidget.run({ symbol: "BTCUSDT", timeframe: "1h", candles: flat, now });

  assert.equal(flatResult.details.rsi14, 50);
  assert.equal(flatResult.details.atr14, 0);
  assert.equal(flatResult.details.candleRangeToAtr, 0);
  assert.equal(flatResult.score, 50);
});

test("Support/Resistance Pressure validates zone distance scoring, breakout direction, and missing-zone fallback", async () => {
  const candles = makeCryptoCandles("BTCUSDT", [
    100, 101, 99, 102, 100, 104, 103, 105, 101, 106,
    104, 108, 106, 110, 107, 111, 108, 112, 109, 113,
    110, 114, 111, 115, 112, 116, 113, 117, 114, 116,
    115, 117, 116, 118, 117, 119, 118, 119.4, 119.8, 120.4
  ], (index, close) => ({
    open: index === 39 ? 118.2 : close - 0.3,
    high: index === 37 ? 121.2 : index === 39 ? 120.7 : close + 0.8,
    low: index === 25 ? 111.5 : index === 39 ? 118 : close - 0.8,
    volume: 1_200
  }));

  const result = await supportResistanceWidget.run({ symbol: "BTCUSDT", timeframe: "1h", candles, now });
  const resistanceDistance = result.details.resistanceDistancePct as number;
  const pressure = clampExpected(100 - (resistanceDistance / 4) * 100, 0, 100);

  assert.equal(result.direction, "breakout_watch");
  assert.equal(result.score, Math.round(55 + pressure * 0.35));
  assert.equal(result.details.currentPrice, 120.4);
  assert.ok((result.details.swingResistanceCount as number) > 0);
  assert.ok((result.details.swingSupportCount as number) > 0);

  const insufficient = await supportResistanceWidget.run({
    symbol: "BTCUSDT",
    timeframe: "1h",
    candles: candles.slice(0, 19),
    now
  });

  assert.equal(insufficient.score, 50);
  assert.equal(insufficient.direction, "mixed");
  assert.equal(insufficient.details.candleCount, 19);
});

test("Volume Confirmation validates volume ratio, price sign, ATR range, falling-volume conflict, and zero baseline", async () => {
  const candles = makeCryptoCandles("BTCUSDT", Array.from({ length: 30 }, (_, index) => 100 + index * 0.2), (index, close) => ({
    open: close - 0.2,
    high: close + 0.9,
    low: close - 0.8,
    volume: index < 25 ? 100 : 220
  }));
  const latest = candles.at(-1)!;
  const previous = candles.at(-2)!;
  const volume = expectedVolumeTrend(candles);
  const atr14 = expectedAtr(candles);
  const priceChangePct = ((latest.close - previous.close) / previous.close) * 100;
  const rangeToAtr = (latest.high - latest.low) / atr14;
  const expectedScore = Math.round(
    clampExpected(
      35 +
        25 +
        (Math.abs(priceChangePct) > 0.3 ? 12 : 0) +
        (rangeToAtr > 1.2 ? 10 : 0),
      0,
      100
    )
  );

  const result = await volumeConfirmationWidget.run({ symbol: "BTCUSDT", timeframe: "1h", candles, now });

  assert.equal(result.score, expectedScore);
  assert.equal(result.direction, "moderate_confirmation");
  assert.equal(result.details.volumeTrend, "rising");
  assert.equal(result.details.volumeRatio, roundExpected(volume.ratio!, 3));
  assert.equal(result.details.priceChangePct, roundExpected(priceChangePct));
  assert.equal(result.details.rangeToAtr, roundExpected(rangeToAtr));

  const zeroBaseline = makeCryptoCandles("BTCUSDT", Array.from({ length: 25 }, () => 100), (index) => ({
    open: 100,
    high: 100,
    low: 100,
    volume: index < 20 ? 0 : 50
  }));
  const zeroResult = await volumeConfirmationWidget.run({ symbol: "BTCUSDT", timeframe: "1h", candles: zeroBaseline, now });

  assert.equal(zeroResult.details.baselineVolumeAverage, 0);
  assert.equal(zeroResult.details.volumeRatio, 1);
  assert.equal(zeroResult.details.volumeTrend, "stable");
  assert.equal(zeroResult.score, 35);
});

test("Multi-Timeframe Alignment validates per-timeframe MA/RSI, alignment ratio, partial data, and missing context state", async () => {
  const timeframeCandles = {
    "15m": makeCryptoCandles("BTCUSDT", Array.from({ length: 36 }, (_, index) => 100 + index)),
    "1h": makeCryptoCandles("BTCUSDT", Array.from({ length: 36 }, (_, index) => 120 + index * 1.2)),
    "4h": makeCryptoCandles("BTCUSDT", Array.from({ length: 36 }, (_, index) => 150 + index * 0.8)),
    "1d": makeCryptoCandles("BTCUSDT", Array.from({ length: 36 }, (_, index) => 220 - index * 0.5))
  };

  const result = await multiTimeframeAlignmentWidget.run({
    symbol: "BTCUSDT",
    timeframe: "1h",
    marketContext: { timeframeCandles },
    now
  });
  const total = 4;
  const bullishCount = 3;
  const bearishCount = 1;
  const alignmentRatio = Math.max(bullishCount, bearishCount) / total;
  const tfDetails = result.details.timeframes as Record<string, Record<string, unknown>>;

  assert.equal(result.score, Math.round(50 + alignmentRatio * 50));
  assert.equal(result.direction, "bullish_aligned");
  assert.equal(result.confidence, roundExpected(clampExpected(0.35 + alignmentRatio * 0.45 + total * 0.03, 0.25, 0.92), 2));
  assert.equal(result.details.alignmentRatio, roundExpected(alignmentRatio, 3));
  assert.equal(tfDetails["15m"].ma7, roundExpected(expectedMovingAverage(timeframeCandles["15m"], 7), 4));
  assert.equal(tfDetails["1d"].rsi14, roundExpected(expectedRsi(timeframeCandles["1d"]), 2));

  const partial = await multiTimeframeAlignmentWidget.run({
    symbol: "BTCUSDT",
    timeframe: "1h",
    marketContext: { timeframeCandles: { "15m": timeframeCandles["15m"], "1h": timeframeCandles["1h"].slice(0, 12) } },
    now
  });

  assert.equal(partial.score, 50);
  assert.equal(partial.direction, "mixed");
  assert.match(partial.summary, /at least two timeframes with 30 candles/);
});

test("Risk Regime validates counts, pressure score, confidence, and missing asset warnings", async () => {
  const assetCandles = {
    BTCUSDT: { "1d": makeCandles("BTCUSDT", "up", 60_000) },
    NASDAQ100: { "1d": makeCandles("NASDAQ100", "up", 17_000) },
    SPX: { "1d": makeCandles("SPX", "down", 5_000) },
    DXY: { "1d": makeCandles("DXY", "up", 100) },
    US10Y: { "1d": makeCandles("US10Y", "up", 4) },
    XAUUSD: { "1d": makeCandles("XAUUSD", "up", 2_200) },
    WTI: { "1d": makeCandles("WTI", "flat", 78) }
  };
  const result = await riskRegimeWidget.run({
    symbol: "BTCUSDT",
    timeframe: "1d",
    marketContext: buildCrossMarketContext({ assetCandles }),
    now
  });
  const expectedScore = Math.round(clampExpected(50 + 2 * 12 - 1 * 10 - 2 * 9 - 4, 0, 100));

  assert.equal(result.score, expectedScore);
  assert.equal(result.direction, "unstable");
  assert.equal(result.confidence, 0.75);
  assert.deepEqual(result.details.counts, {
    riskOnCount: 2,
    riskWeaknessCount: 1,
    riskOffPressureCount: 2,
    defensiveBid: true
  });

  const partial = await riskRegimeWidget.run({
    symbol: "BTCUSDT",
    timeframe: "1d",
    marketContext: buildCrossMarketContext({ assetCandles: { ...assetCandles, WTI: { "1d": [] } } }),
    now
  });

  assert.deepEqual(partial.details.warnings, ["WTI has 0 candles; 20 required"]);
});

test("Macro Risk Pulse validates weighted contribution score, ratios, correlation drivers, and partial coverage", async () => {
  const assetCandles = {
    BTCUSDT: { "1d": makeCandles("BTCUSDT", "up", 60_000) },
    NASDAQ100: { "1d": makeCandles("NASDAQ100", "up", 17_000) },
    SPX: { "1d": makeCandles("SPX", "down", 5_000) },
    DXY: { "1d": makeCandles("DXY", "up", 100) },
    US10Y: { "1d": makeCandles("US10Y", "down", 60) },
    XAUUSD: { "1d": makeCandles("XAUUSD", "up", 2_200) },
    WTI: { "1d": makeCandles("WTI", "flat", 78) }
  };
  const correlations = [pair("btc_nasdaq100", 0.45), pair("btc_dxy", -0.5)];
  const result = await macroRiskPulseWidget.run({
    symbol: "BTCUSDT",
    timeframe: "1d",
    marketContext: buildCrossMarketContext({ assetCandles, correlations }),
    now
  });
  const contributionTotal = 1.2 + 1.15 - 1 - 1.1 + 1 + -0.55;
  const totalWeight = 1.2 + 1.15 + 1 + 1.1 + 1 + 0.55 + 0.45;
  const expectedScore = Math.round(clampExpected(50 + (contributionTotal / totalWeight) * 50, 0, 100));
  const conflictRatio = Math.min(1.2 + 1.15 + 1, 1 + 1.1 + 0.55) / totalWeight;

  assert.equal(result.score, expectedScore);
  assert.equal(result.details.coverageRatio, 1);
  assert.equal(result.details.conflictRatio, roundExpected(conflictRatio, 3));
  assert.equal((result.details.correlations as Record<string, unknown>).pairCount, 2);
  assert.equal(result.confidence, roundExpected(clampExpected(0.25 + 0.38 + (1 - conflictRatio) * 0.22 + 0.02, 0.2, 0.88), 2));
});

test("Dollar, Gold, Oil, and Cross-Market Divergence validate additive formulas, correlations, volatility cap, and warnings", async () => {
  const assetCandles = {
    BTCUSDT: { "1d": makeCandles("BTCUSDT", "down", 60_000) },
    NASDAQ100: { "1d": makeCandles("NASDAQ100", "down", 17_000) },
    SPX: { "1d": makeCandles("SPX", "down", 5_000) },
    DXY: { "1d": makeCandles("DXY", "up", 100) },
    US10Y: { "1d": makeCandles("US10Y", "up", 4) },
    XAUUSD: { "1d": makeCandles("XAUUSD", "up", 2_200) },
    WTI: { "1d": makeCandles("WTI", "up", 75) }
  };
  const correlations = [
    pair("btc_dxy", -0.6, "right_outperforming"),
    pair("gold_dxy", 0.2),
    pair("oil_spx", -0.4, "left_outperforming")
  ];
  const context = buildCrossMarketContext({ assetCandles, correlations });

  const dollar = await dollarPressureWidget.run({ symbol: "BTCUSDT", timeframe: "1d", marketContext: context, now });
  assert.equal(dollar.score, Math.round(clampExpected(50 + 28 + 2 * 9 + 0 + 8, 0, 100)));
  assert.equal(dollar.direction, "high_dollar_pressure");
  assert.equal((dollar.details.correlations as Record<string, unknown>).btcDxyLatest, -0.6);

  const gold = await goldRiskHedgeWidget.run({ symbol: "BTCUSDT", timeframe: "1d", marketContext: context, now });
  assert.equal(gold.score, 100);
  assert.equal(gold.direction, "dollar_yield_resilient");
  assert.deepEqual(gold.details.drivers, {
    equitiesWeak: true,
    pressureRising: true,
    inflationImpulse: true
  });

  const oil = await oilInflationPressureWidget.run({ symbol: "BTCUSDT", timeframe: "1d", marketContext: context, now });
  const oilSignal = expectedCrossMarketSignal(assetCandles.WTI["1d"]);
  const oilVolatility = ((oil.details.confirmations as Record<string, unknown>).oilVolatility20Pct as number);
  assert.equal(oil.score, Math.round(clampExpected(50 + 24 + 10 + 7 + 8 + 5 + Math.min(oilVolatility * 2, 10), 0, 100)));
  assert.equal(oil.direction, "inflation_pressure");
  assert.equal((oil.details.assets as Record<string, Record<string, unknown>>).WTI.ma20, roundExpected(oilSignal.ma20!, 4));

  const divergence = await crossMarketDivergenceWidget.run({ symbol: "BTCUSDT", timeframe: "1d", marketContext: context, now });
  const structuralDivergences = divergence.details.structuralDivergences as string[];
  assert.equal(divergence.score, Math.round(clampExpected(35 + 2 * 12 + structuralDivergences.length * 13, 0, 100)));
  assert.equal((divergence.details.pairDivergences as unknown[]).length, 2);

  const partial = await dollarPressureWidget.run({
    symbol: "BTCUSDT",
    timeframe: "1d",
    marketContext: buildCrossMarketContext({ assetCandles: { ...assetCandles, XAUUSD: { "1d": [] } } }),
    now
  });
  assert.deepEqual(partial.details.warnings, ["XAUUSD has 0 candles; 20 required"]);
});
