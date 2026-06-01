import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { derivativesPressureWidget } from "./derivativesPressureWidget";

describe("derivatives pressure widget", () => {
  it("flags crowded long pressure when funding, long skew, and open interest expand", async () => {
    const result = await derivativesPressureWidget.run({
      symbol: "BTCUSDT",
      timeframe: "1h",
      candles: [],
      marketContext: {
        derivatives: {
          BTCUSDT: {
            "1h": {
              symbol: "BTCUSDT",
              period: "1h",
              source: "binance_futures",
              updatedAt: "2026-05-22T12:00:00.000Z",
              fundingRate: 0.0008,
              nextFundingTime: Date.parse("2026-05-22T16:00:00.000Z"),
              markPrice: 104050,
              indexPrice: 104000,
              openInterest: 12500,
              openInterestValue: 1300000000,
              openInterestChangePct: 4.2,
              longShortRatio: 1.48,
              longAccount: 0.6,
              shortAccount: 0.4,
              basis: 50,
              basisRate: 0.00048,
              annualizedBasisRate: 0.17,
              futuresPrice: 104050,
              sampleCount: 80
            }
          }
        }
      },
      now: new Date("2026-05-22T12:05:00.000Z")
    });

    assert.equal(result.widgetId, "derivatives_pressure");
    assert.equal(result.direction, "crowded_longs");
    assert.equal(result.severity, "high");
    assert.ok(result.score > 60);
    assert.equal(result.sources[0].source, "binance_futures");
  });

  it("returns an explainable unknown result when derivatives context is missing", async () => {
    const result = await derivativesPressureWidget.run({
      symbol: "ETHUSDT",
      timeframe: "1h",
      candles: [],
      now: new Date("2026-05-22T12:05:00.000Z")
    });

    assert.equal(result.direction, "unknown");
    assert.equal(result.confidence, 0.18);
    assert.equal(result.details.reason, "No stored Binance USD-M futures derivatives metrics");
  });
});
