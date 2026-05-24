import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCrossMarketContext,
  getAssetCandles,
  getCorrelationPair,
  listRegimeHints
} from "./marketContext";
import { validateWidgetResult } from "./runner";
import type { CandleRecord } from "@/lib/db/types";
import type { WidgetEngine } from "./types";

function candle(symbol: string, close: number): CandleRecord {
  return {
    id: 1,
    symbol,
    timeframe: "1d",
    openTime: Date.parse("2026-05-21T00:00:00.000Z"),
    closeTime: Date.parse("2026-05-21T23:59:59.999Z"),
    open: close,
    high: close,
    low: close,
    close,
    volume: 0,
    source: "test",
    createdAt: "2026-05-22T00:00:00.000Z"
  };
}

test("cross-market context exposes asset candles, correlations, and regime hints", () => {
  const context = buildCrossMarketContext({
    assetCandles: {
      BTCUSDT: {
        "1d": [candle("BTCUSDT", 100)]
      },
      DXY: {
        "1d": [candle("DXY", 105)]
      }
    },
    correlations: [
      {
        id: "btc_dxy",
        label: "BTC / DXY",
        leftSymbol: "BTCUSDT",
        rightSymbol: "DXY",
        timeframe: "1d",
        observations: 30,
        latestCorrelation: -0.64,
        rollingCorrelation: [],
        divergence: {
          leftCumulativeReturn: 0.02,
          rightCumulativeReturn: -0.01,
          spread: 0.03,
          absSpread: 0.03,
          direction: "left_outperforming",
          sampleSize: 5
        },
        leftVolatilityAdjustedMovement: {
          latestReturn: 0.01,
          meanReturn: 0.001,
          volatility: 0.02,
          zScore: 0.45,
          sampleSize: 20
        },
        rightVolatilityAdjustedMovement: {
          latestReturn: -0.005,
          meanReturn: 0.001,
          volatility: 0.01,
          zScore: -0.6,
          sampleSize: 20
        },
        updatedAt: "2026-05-22T00:00:00.000Z",
        warnings: []
      }
    ],
    regimeHints: [
      {
        id: "macro_risk",
        bias: "risk_off_pressure",
        confidence: 0.72,
        summary: "Dollar strength is pressuring risk assets.",
        drivers: ["DXY rising", "BTC/DXY inverse correlation"],
        updatedAt: "2026-05-22T00:00:00.000Z"
      }
    ]
  });

  assert.equal(getAssetCandles(context, "BTCUSDT", "1d").length, 1);
  assert.equal(getAssetCandles(context, "DXY", "1d")[0].close, 105);
  assert.equal(getCorrelationPair(context, "btc_dxy")?.latestCorrelation, -0.64);
  assert.equal(listRegimeHints(context)[0].bias, "risk_off_pressure");
});

test("phase 2 widgets can consume cross-market context and return the existing result contract", async () => {
  const widget: WidgetEngine = {
    id: "cross_market_contract_probe",
    name: "Cross-Market Contract Probe",
    description: "Verifies that Phase 2 widgets can read multi-asset context.",
    requiredInputs: ["marketContext.assetCandles", "marketContext.correlations"],
    async run(context) {
      const btcCandles = getAssetCandles(context.marketContext, "BTCUSDT", "1d");
      const dxyCandles = getAssetCandles(context.marketContext, "DXY", "1d");
      const correlation = getCorrelationPair(context.marketContext, "btc_dxy");

      return {
        widgetId: "cross_market_contract_probe",
        symbol: context.symbol,
        timeframe: context.timeframe,
        score: 58,
        direction: "mixed",
        confidence: 0.64,
        severity: "medium",
        summary: "Cross-market context is available to the widget engine.",
        details: {
          btcCandles: btcCandles.length,
          dxyCandles: dxyCandles.length,
          latestCorrelation: correlation?.latestCorrelation ?? null
        },
        sources: [
          {
            source: "test",
            type: "cross_market_context",
            updatedAt: context.now.toISOString()
          }
        ],
        updatedAt: context.now.toISOString()
      };
    }
  };

  const result = await widget.run({
    symbol: "BTCUSDT",
    timeframe: "1d",
    now: new Date("2026-05-22T00:00:00.000Z"),
    marketContext: buildCrossMarketContext({
      assetCandles: {
        BTCUSDT: {
          "1d": [candle("BTCUSDT", 100)]
        },
        DXY: {
          "1d": [candle("DXY", 105)]
        }
      },
      correlations: [
        {
          id: "btc_dxy",
          label: "BTC / DXY",
          leftSymbol: "BTCUSDT",
          rightSymbol: "DXY",
          timeframe: "1d",
          observations: 30,
          latestCorrelation: -0.64,
          rollingCorrelation: [],
          divergence: {
            leftCumulativeReturn: null,
            rightCumulativeReturn: null,
            spread: null,
            absSpread: null,
            direction: "insufficient_data",
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
        }
      ]
    })
  });

  assert.doesNotThrow(() => validateWidgetResult(result));
  assert.deepEqual(result.details, {
    btcCandles: 1,
    dxyCandles: 1,
    latestCorrelation: -0.64
  });
});
