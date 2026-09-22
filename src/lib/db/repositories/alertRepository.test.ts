import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { runMigrations } from "@/lib/db/migrations";
import { createUser } from "./accountRepository";
import {
  acknowledgeAlertEvent,
  countAlertEventsInRange,
  findOpenAlertEvent,
  insertAlertEvent,
  insertAlertRule,
  listAlertEvents,
  listAlertEventsInRange,
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

  it("reads one user's window against the datetime('now') column default", () => {
    const db = createMemoryDatabase();
    const userId = addUser(db, "windowed@example.com");
    const otherUserId = addUser(db, "elsewhere@example.com");
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

    function addEvent(owner: number, triggerKey: string) {
      return insertAlertEvent(db, {
        ruleId,
        userId: owner,
        symbol: "BTCUSDT",
        timeframe: "1h",
        triggerKey,
        severity: "warning",
        title: "Bias changed",
        message: "BTC bias changed.",
        explanation: "The weighted widget mix changed.",
        sourceWidget: null,
        overviewId: null,
        metadataJson: "{}"
      });
    }

    const first = addEvent(userId, "one");
    const second = addEvent(userId, "two");
    const third = addEvent(userId, "three");
    addEvent(otherUserId, "four");

    // The column default is `YYYY-MM-DD HH:MM:SS` in UTC, so the bounds are
    // written in that shape rather than as ISO strings.
    const stored = db.prepare("SELECT created_at FROM alert_events WHERE id = ?").get(first) as {
      created_at: string;
    };
    const window = { userId, from: stored.created_at, to: stored.created_at };

    assert.equal(countAlertEventsInRange(db, window), 3);
    assert.deepEqual(
      listAlertEventsInRange(db, window).map((event) => event.id),
      [third, second, first]
    );

    // A bound one second past the stored value excludes every row.
    const after = new Date(`${stored.created_at.replace(" ", "T")}Z`);
    after.setUTCSeconds(after.getUTCSeconds() + 1);
    const nextSecond = after.toISOString().slice(0, 19).replace("T", " ");

    assert.equal(countAlertEventsInRange(db, { userId, from: nextSecond, to: nextSecond }), 0);

    // The second user's event never appears in the first user's window.
    assert.equal(listAlertEventsInRange(db, { ...window, userId: otherUserId }).length, 1);

    // Newest-first, so the limit drops the oldest.
    assert.deepEqual(
      listAlertEventsInRange(db, { ...window, limit: 2 }).map((event) => event.id),
      [third, second]
    );
  });
});
