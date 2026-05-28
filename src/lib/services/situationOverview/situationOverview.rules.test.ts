import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WidgetResultApi } from "@/lib/api/types";
import { buildSituationOverview } from "./situationOverview.rules";
import type { SituationOverview } from "./situationOverview.types";

const now = new Date("2026-05-28T08:00:00.000Z");
const recentSource = {
  source: "binance",
  type: "ohlcv",
  symbol: "BTCUSDT",
  timeframe: "1h",
  updatedAt: "2026-05-28T07:00:00.000Z"
};

function widget(overrides: Partial<WidgetResultApi> & Pick<WidgetResultApi, "widgetId" | "score" | "direction">): WidgetResultApi {
  return {
    id: overrides.id ?? 1,
    widgetId: overrides.widgetId,
    symbol: overrides.symbol ?? "BTCUSDT",
    timeframe: overrides.timeframe ?? "1h",
    score: overrides.score,
    direction: overrides.direction,
    confidence: overrides.confidence ?? 0.78,
    severity: overrides.severity ?? "medium",
    summary: overrides.summary ?? `${overrides.widgetId} fixture summary`,
    details: overrides.details ?? {},
    sources: overrides.sources ?? [recentSource],
    updatedAt: overrides.updatedAt ?? "2026-05-28T07:00:00.000Z"
  };
}

function build(widgets: WidgetResultApi[], previousOverview: SituationOverview | null = null) {
  return buildSituationOverview({
    symbol: "BTCUSDT",
    timeframe: "1h",
    generatedAt: now,
    widgets,
    expectedWidgetIds: [
      "trend_strength",
      "momentum_exhaustion",
      "volume_confirmation",
      "multi_timeframe_alignment",
      "support_resistance_pressure",
      "liquidations"
    ],
    previousOverview
  });
}

describe("situation overview rules", () => {
  it("classifies an aligned bullish setup", () => {
    const overview = build([
      widget({ widgetId: "trend_strength", score: 82, direction: "bullish", confidence: 0.84 }),
      widget({ widgetId: "momentum_exhaustion", score: 72, direction: "healthy_bullish", confidence: 0.78 }),
      widget({
        widgetId: "volume_confirmation",
        score: 79,
        direction: "strong_confirmation",
        confidence: 0.76,
        details: { candleDirection: "green" }
      }),
      widget({ widgetId: "multi_timeframe_alignment", score: 86, direction: "bullish_aligned", confidence: 0.82 })
    ]);

    assert.equal(overview.bias, "bullish");
    assert.equal(overview.confidence, "high");
    assert.ok(overview.score > 40);
    assert.ok(overview.mainDrivers.some((driver) => driver.sourceWidget === "trend_strength"));
    assert.equal(overview.conflictingSignals.length, 0);
  });

  it("classifies an aligned bearish setup", () => {
    const overview = build([
      widget({ widgetId: "trend_strength", score: 18, direction: "bearish", confidence: 0.86 }),
      widget({ widgetId: "momentum_exhaustion", score: 28, direction: "healthy_bearish", confidence: 0.78 }),
      widget({
        widgetId: "volume_confirmation",
        score: 76,
        direction: "strong_confirmation",
        confidence: 0.75,
        details: { candleDirection: "red" }
      }),
      widget({ widgetId: "multi_timeframe_alignment", score: 16, direction: "bearish_aligned", confidence: 0.82 })
    ]);

    assert.equal(overview.bias, "bearish");
    assert.equal(overview.confidence, "high");
    assert.ok(overview.score < -40);
    assert.ok(overview.mainDrivers.some((driver) => driver.direction === "bearish"));
  });

  it("reports mixed state when core signals conflict", () => {
    const overview = build([
      widget({ widgetId: "trend_strength", score: 28, direction: "bearish", confidence: 0.76 }),
      widget({ widgetId: "momentum_exhaustion", score: 70, direction: "healthy_bullish", confidence: 0.72 }),
      widget({ widgetId: "volume_confirmation", score: 38, direction: "conflicting", confidence: 0.58 }),
      widget({ widgetId: "multi_timeframe_alignment", score: 50, direction: "mixed", confidence: 0.64 })
    ]);

    assert.equal(overview.bias, "mixed");
    assert.ok(overview.conflictingSignals.length >= 1);
    assert.ok(overview.riskScore >= 45);
  });

  it("returns a partial unknown overview when data is missing", () => {
    const overview = build([]);

    assert.equal(overview.bias, "unknown");
    assert.equal(overview.riskLevel, "unknown");
    assert.equal(overview.confidence, "low");
    assert.equal(overview.meta.isPartial, true);
    assert.ok(overview.meta.missingInputs.includes("trend_strength"));
    assert.ok(overview.dataWarnings.some((warning) => warning.id === "missing-overview-inputs"));
  });

  it("keeps bearish bias and notes observed liquidation history", () => {
    const overview = build([
      widget({ widgetId: "trend_strength", score: 22, direction: "bearish", confidence: 0.82 }),
      widget({ widgetId: "momentum_exhaustion", score: 30, direction: "healthy_bearish", confidence: 0.74 }),
      widget({
        widgetId: "liquidations",
        score: 34,
        direction: "long_liquidations_dominant",
        confidence: 0.7,
        details: {
          isStale: false
        }
      })
    ]);

    assert.equal(overview.bias, "bearish");
    assert.ok(overview.dataWarnings.some((warning) => warning.id === "liquidations-local-history"));
  });

  it("detects previous-to-current changes", () => {
    const previous = build([
      widget({ widgetId: "trend_strength", score: 82, direction: "bullish", confidence: 0.84 }),
      widget({ widgetId: "momentum_exhaustion", score: 72, direction: "healthy_bullish", confidence: 0.78 })
    ]);
    const current = build(
      [
        widget({ widgetId: "trend_strength", score: 18, direction: "bearish", confidence: 0.86 }),
        widget({ widgetId: "momentum_exhaustion", score: 28, direction: "healthy_bearish", confidence: 0.78 })
      ],
      previous
    );

    assert.ok(current.changedSincePrevious?.some((change) => change.id === "bias-change"));
    assert.ok(current.changedSincePrevious?.some((change) => change.id === "score-change"));
  });
});
