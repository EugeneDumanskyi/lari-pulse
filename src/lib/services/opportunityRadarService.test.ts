import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { AccessError } from "@/lib/auth/access";
import { anonymousTestSession, createTestSession } from "@/lib/auth/testing";
import { runMigrations } from "@/lib/db/migrations";
import { insertWidgetResult } from "@/lib/db/repositories/widgetResultsRepository";
import { getOpportunityRadar, scoreOpportunityOverview } from "./opportunityRadarService";
import type { SituationOverview } from "./situationOverview/situationOverview.types";

function createMemoryDatabase() {
  const db = new Database(":memory:");
  runMigrations(db);
  return db;
}

function overview(overrides: Partial<SituationOverview> = {}): SituationOverview {
  return {
    symbol: "BTCUSDT",
    timeframe: "1h",
    generatedAt: "2026-06-01T10:00:00.000Z",
    title: "BTC is bullish with moderate risk",
    summary: "Trend supports the move.",
    bias: "bullish",
    riskLevel: "moderate",
    confidence: "high",
    score: 76,
    riskScore: 34,
    mainDrivers: [{
      id: "driver-trend_strength",
      label: "Trend Strength",
      direction: "bullish",
      strength: "high",
      explanation: "Price structure and moving averages support the move.",
      sourceWidget: "trend_strength"
    }],
    conflictingSignals: [],
    watchConditions: [],
    dataWarnings: [],
    changedSincePrevious: [],
    sourceWidgets: [],
    meta: {
      missingInputs: [],
      staleInputs: [],
      usedFallbacks: [],
      isPartial: false
    },
    ...overrides
  };
}

describe("opportunity radar service", () => {
  it("scores clean directional states above conflicted high-risk states", () => {
    const clean = scoreOpportunityOverview(overview());
    const conflicted = scoreOpportunityOverview(overview({
      riskLevel: "high",
      confidence: "low",
      conflictingSignals: [{
        id: "conflict-volume",
        label: "Volume Confirmation",
        direction: "bearish",
        strength: "medium",
        explanation: "Volume does not confirm the move."
      }],
      dataWarnings: [{
        id: "stale-volume",
        label: "Stale volume",
        explanation: "Latest volume input is stale.",
        severity: "warning"
      }]
    }));

    assert.ok(clean > conflicted);
    assert.ok(clean >= 60);
  });

  it("requires a signed-in viewer to scan opportunities", async () => {
    const db = createMemoryDatabase();

    await assert.rejects(
      () => getOpportunityRadar({ db, session: anonymousTestSession(db), timeframes: ["1h"] }),
      AccessError
    );
  });

  it("ranks configured symbols and timeframes from stored widget signals", async () => {
    const db = createMemoryDatabase();
    const session = createTestSession(db, "viewer");

    insertWidgetResult(db, {
      widgetId: "trend_strength",
      symbol: "BTCUSDT",
      timeframe: "1h",
      score: 82,
      direction: "bullish",
      confidence: 0.82,
      severity: "low",
      summary: "BTC trend is strongly bullish.",
      detailsJson: JSON.stringify({ structure: "higher_lows" }),
      sourcesJson: JSON.stringify([])
    });
    insertWidgetResult(db, {
      widgetId: "trend_strength",
      symbol: "ETHUSDT",
      timeframe: "1h",
      score: 34,
      direction: "bearish",
      confidence: 0.44,
      severity: "medium",
      summary: "ETH trend remains weak.",
      detailsJson: JSON.stringify({ structure: "lower_highs" }),
      sourcesJson: JSON.stringify([])
    });

    const radar = await getOpportunityRadar({
      db,
      session,
      symbols: ["BTCUSDT", "ETHUSDT"],
      timeframes: ["1h"],
      now: new Date("2026-06-01T10:00:00.000Z")
    });

    assert.equal(radar.items.length, 2);
    assert.deepEqual(radar.items.map((item) => item.rank), [1, 2]);
    assert.ok(radar.items[0]);
    assert.ok(radar.items[1]);
    assert.ok(radar.items[0].setupScore >= radar.items[1].setupScore);
    assert.equal(radar.items[0]?.timeframe, "1h");
  });
});
