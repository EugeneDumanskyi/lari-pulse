import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { runMigrations } from "@/lib/db/migrations";
import {
  acknowledgeAlertEvent,
  findOpenAlertEvent,
  insertAlertEvent,
  insertAlertRule,
  listAlertEvents,
  listAlertRules
} from "./alertRepository";

function createMemoryDatabase() {
  const db = new Database(":memory:");
  runMigrations(db);
  return db;
}

describe("alert repository", () => {
  it("stores rules, dedupe lookups, and acknowledgements", () => {
    const db = createMemoryDatabase();
    const ruleId = insertAlertRule(db, {
      ruleType: "situation_bias_changed",
      symbol: "BTCUSDT",
      timeframe: "1h",
      accessPlan: "enterprise",
      title: "Bias changed",
      description: "Trigger on bias changes.",
      severity: "warning",
      isEnabled: true,
      widgetId: null,
      watchConditionId: null,
      thresholdValue: null,
      thresholdDirection: null
    });

    const rules = listAlertRules(db, {
      accessPlan: "enterprise",
      symbol: "BTCUSDT",
      timeframe: "1h",
      enabledOnly: true
    });
    assert.equal(rules.length, 1);
    assert.equal(rules[0]?.id, ruleId);

    const eventId = insertAlertEvent(db, {
      ruleId,
      symbol: "BTCUSDT",
      timeframe: "1h",
      accessPlan: "enterprise",
      triggerKey: "bias:neutral->bullish",
      severity: "warning",
      title: "Bias changed",
      message: "BTC bias changed.",
      explanation: "The weighted widget mix changed.",
      sourceWidget: "trend_strength",
      overviewId: null,
      metadataJson: JSON.stringify({ current: "bullish" })
    });

    const open = findOpenAlertEvent(db, {
      ruleId,
      symbol: "BTCUSDT",
      timeframe: "1h",
      triggerKey: "bias:neutral->bullish"
    });
    assert.equal(open?.id, eventId);

    const acknowledged = acknowledgeAlertEvent(db, eventId);
    assert.ok(acknowledged?.acknowledgedAt);
    assert.equal(
      findOpenAlertEvent(db, {
        ruleId,
        symbol: "BTCUSDT",
        timeframe: "1h",
        triggerKey: "bias:neutral->bullish"
      }),
      null
    );
    assert.equal(listAlertEvents(db, { accessPlan: "enterprise", includeAcknowledged: true }).length, 1);
    assert.equal(listAlertEvents(db, { accessPlan: "enterprise", includeAcknowledged: false }).length, 0);
  });
});
