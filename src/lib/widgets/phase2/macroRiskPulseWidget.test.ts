import assert from "node:assert/strict";
import test from "node:test";
import type { CorrelationPairResult } from "@/lib/correlations/types";
import type { CandleRecord } from "@/lib/db/types";
import { buildCrossMarketContext } from "../marketContext";
import { validateWidgetResult } from "../runner";
import { phase2Widgets } from ".";

function makeCandles(symbol: string, trend: "up" | "down" | "flat", start = 100): CandleRecord[] {
  return Array.from({ length: 36 }, (_, index) => {
    const slope = trend === "up" ? 1.1 : trend === "down" ? -0.85 : 0.05;
    const close = start + index * slope + Math.sin(index / 3) * 0.2;
    const open = close - slope * 0.25;

    return {
      id: index + 1,
      symbol,
      timeframe: "1d",
      openTime: Date.UTC(2026, 3, 1 + index),
      closeTime: Date.UTC(2026, 3, 1 + index, 23, 59, 59),
      open,
      high: Math.max(open, close) + 0.5,
      low: Math.min(open, close) - 0.5,
      close,
      volume: 1000 + index,
      source: symbol === "BTCUSDT" ? "binance" : "fred",
      createdAt: "2026-05-22T00:00:00.000Z"
    };
  });
}

function pair(
  id: string,
  latestCorrelation: number,
  divergenceDirection: CorrelationPairResult["divergence"]["direction"] = "aligned"
): CorrelationPairResult {
  return {
    id,
    label: id,
    leftSymbol: "BTCUSDT",
    rightSymbol: id.includes("dxy") ? "DXY" : "NASDAQ100",
    timeframe: "1d",
    observations: 30,
    latestCorrelation,
    rollingCorrelation: [],
    divergence: {
      leftCumulativeReturn: null,
      rightCumulativeReturn: null,
      spread: null,
      absSpread: null,
      direction: divergenceDirection,
      sampleSize: 0
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
    updatedAt: "2026-05-22T00:00:00.000Z",
    warnings: []
  };
}

test("phase2Widgets exposes all Phase 2 widget engines without changing Phase 1 default registry", () => {
  assert.deepEqual(
    phase2Widgets.map((widget) => widget.id),
    [
      "macro_risk_pulse",
      "dollar_pressure",
      "gold_risk_hedge",
      "oil_inflation_pressure",
      "nasdaq_crypto_correlation",
      "cross_market_divergence",
      "risk_regime"
    ]
  );
});

test("Macro Risk Pulse produces risk-on output from supportive cross-market context", async () => {
  const result = await phase2Widgets[0].run({
    symbol: "BTCUSDT",
    timeframe: "1d",
    now: new Date("2026-05-22T00:00:00.000Z"),
    marketContext: buildCrossMarketContext({
      assetCandles: {
        BTCUSDT: { "1d": makeCandles("BTCUSDT", "up", 100) },
        NASDAQ100: { "1d": makeCandles("NASDAQ100", "up", 16000) },
        SPX: { "1d": makeCandles("SPX", "up", 5000) },
        DXY: { "1d": makeCandles("DXY", "down", 105) },
        US10Y: { "1d": makeCandles("US10Y", "down", 4.8) },
        XAUUSD: { "1d": makeCandles("XAUUSD", "down", 2400) },
        WTI: { "1d": makeCandles("WTI", "down", 85) }
      },
      correlations: [pair("btc_nasdaq100", 0.72), pair("btc_dxy", -0.58)]
    })
  });

  validateWidgetResult(result);
  assert.equal(result.widgetId, "macro_risk_pulse");
  assert.equal(result.direction, "risk_on");
  assert.ok(result.score > 70);
  assert.equal(result.details.correlations instanceof Object, true);
});

test("Macro Risk Pulse produces risk-off pressure from dollar, yields, and weak risk assets", async () => {
  const result = await phase2Widgets[0].run({
    symbol: "BTCUSDT",
    timeframe: "1d",
    now: new Date("2026-05-22T00:00:00.000Z"),
    marketContext: buildCrossMarketContext({
      assetCandles: {
        BTCUSDT: { "1d": makeCandles("BTCUSDT", "down", 100) },
        NASDAQ100: { "1d": makeCandles("NASDAQ100", "down", 16000) },
        SPX: { "1d": makeCandles("SPX", "down", 5000) },
        DXY: { "1d": makeCandles("DXY", "up", 105) },
        US10Y: { "1d": makeCandles("US10Y", "up", 4.2) },
        XAUUSD: { "1d": makeCandles("XAUUSD", "up", 2300) },
        WTI: { "1d": makeCandles("WTI", "up", 80) }
      },
      correlations: [pair("btc_nasdaq100", 0.68), pair("btc_dxy", -0.61)]
    })
  });

  validateWidgetResult(result);
  assert.equal(result.direction, "risk_off_pressure");
  assert.ok(result.score < 30);
  assert.match(result.summary, /risk-off pressure/);
});

test("all additional Phase 2 widgets produce valid explainable WidgetResult outputs", async () => {
  const context = {
    symbol: "BTCUSDT",
    timeframe: "1d",
    now: new Date("2026-05-22T00:00:00.000Z"),
    marketContext: buildCrossMarketContext({
      assetCandles: {
        BTCUSDT: { "1d": makeCandles("BTCUSDT", "down", 100) },
        ETHUSDT: { "1d": makeCandles("ETHUSDT", "down", 3000) },
        SOLUSDT: { "1d": makeCandles("SOLUSDT", "down", 170) },
        NASDAQ100: { "1d": makeCandles("NASDAQ100", "down", 16000) },
        SPX: { "1d": makeCandles("SPX", "down", 5000) },
        DXY: { "1d": makeCandles("DXY", "up", 105) },
        US10Y: { "1d": makeCandles("US10Y", "up", 4.2) },
        XAUUSD: { "1d": makeCandles("XAUUSD", "up", 2300) },
        WTI: { "1d": makeCandles("WTI", "up", 80) }
      },
      correlations: [
        pair("btc_nasdaq100", 0.68, "right_outperforming"),
        pair("eth_nasdaq100", 0.52, "right_outperforming"),
        pair("sol_nasdaq100", 0.43),
        pair("btc_dxy", -0.61),
        pair("gold_dxy", 0.22, "left_outperforming")
      ]
    })
  };

  for (const widget of phase2Widgets.slice(1)) {
    const result = await widget.run(context);

    assert.equal(result.widgetId, widget.id);
    validateWidgetResult(result);
    assert.ok(Object.keys(result.details).length > 0);
    assert.ok(result.sources.length > 0);
  }
});
