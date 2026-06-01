import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { createAdminSession } from "@/lib/auth/access";
import { runMigrations } from "@/lib/db/migrations";
import {
  acknowledgeEventForSession,
  createRuleForSession,
  evaluateAlertRulesForOverview,
  listEventsForSession
} from "./alertService";
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
    confidence: "medium",
    score: 42,
    riskScore: 48,
    mainDrivers: [{
      id: "driver-trend_strength",
      label: "Trend Strength",
      direction: "bullish",
      strength: "medium",
      explanation: "Trend supports the move.",
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

describe("alert service", () => {
  it("creates explainable events for changed situation state and dedupes open events", () => {
    const db = createMemoryDatabase();
    const session = createAdminSession();

    createRuleForSession({
      db,
      session,
      input: {
        ruleType: "situation_bias_changed",
        symbol: "BTCUSDT",
        timeframe: "1h",
        severity: "warning"
      }
    });

    const previous = overview({ bias: "neutral", score: 5 });
    const current = overview({
      bias: "bullish",
      changedSincePrevious: [{
        id: "bias-change",
        label: "Bias changed",
        previous: "neutral",
        current: "bullish",
        explanation: "Bias moved from neutral to bullish as the weighted widget mix changed."
      }]
    });

    const first = evaluateAlertRulesForOverview({
      db,
      overview: current,
      previousOverview: previous,
      accessPlan: session.plan
    });
    const second = evaluateAlertRulesForOverview({
      db,
      overview: current,
      previousOverview: previous,
      accessPlan: session.plan
    });

    assert.equal(first.length, 1);
    assert.equal(second.length, 0);
    assert.match(first[0]?.message ?? "", /bias moved from neutral to bullish/i);
  });

  it("allows acknowledged triggers to fire again", () => {
    const db = createMemoryDatabase();
    const session = createAdminSession();

    createRuleForSession({
      db,
      session,
      input: {
        ruleType: "risk_level_changed",
        symbol: "BTCUSDT",
        timeframe: "1h",
        severity: "critical"
      }
    });

    const previous = overview({ riskLevel: "moderate" });
    const current = overview({
      riskLevel: "high",
      changedSincePrevious: [{
        id: "risk-change",
        label: "Risk changed",
        previous: "moderate",
        current: "high",
        explanation: "Risk moved from moderate to high based on severity and conflicts."
      }]
    });

    evaluateAlertRulesForOverview({
      db,
      overview: current,
      previousOverview: previous,
      accessPlan: session.plan
    });
    const [event] = listEventsForSession({ db, session });
    assert.ok(event);
    acknowledgeEventForSession({ db, session, id: event.id });

    const repeated = evaluateAlertRulesForOverview({
      db,
      overview: current,
      previousOverview: previous,
      accessPlan: session.plan
    });

    assert.equal(repeated.length, 1);
    assert.equal(listEventsForSession({ db, session, includeAcknowledged: true }).length, 2);
  });
});
