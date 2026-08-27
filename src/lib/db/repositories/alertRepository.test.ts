import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { runMigrations } from "@/lib/db/migrations";
import { createUser } from "./accountRepository";
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
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

function addUser(db: Database.Database, email: string) {
  return createUser(db, { email, passwordHash: "x", role: "analyst", status: "active" }).id;
}

describe("alert repository", () => {
  it("stores rules, dedupe lookups, and acknowledgements per user", () => {
    const db = createMemoryDatabase();
    const userId = addUser(db, "owner@example.com");
    const otherUserId = addUser(db, "other@example.com");
    const ruleId = insertAlertRule(db, {
      userId,
      ruleType: "situation_bias_changed",
      symbol: "BTCUSDT",
      timeframe: "1h",
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
      userId,
      symbol: "BTCUSDT",
      timeframe: "1h",
      enabledOnly: true
    });
    assert.equal(rules.length, 1);
    assert.equal(rules[0]?.id, ruleId);
    assert.equal(listAlertRules(db, { userId: otherUserId }).length, 0);
    assert.equal(listAlertRules(db, { symbol: "BTCUSDT", timeframe: "1h", enabledOnly: true }).length, 1);

    const eventId = insertAlertEvent(db, {
      ruleId,
      userId,
      symbol: "BTCUSDT",
      timeframe: "1h",
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
    assert.equal(listAlertEvents(db, { userId, includeAcknowledged: true }).length, 1);
    assert.equal(listAlertEvents(db, { userId, includeAcknowledged: false }).length, 0);
    assert.equal(listAlertEvents(db, { userId: otherUserId, includeAcknowledged: true }).length, 0);
  });
});
