import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type Database from "better-sqlite3";
import { anonymousTestSession, createTestDatabase, createTestSession } from "@/lib/auth/testing";
import { insertAlertEvent, insertAlertRule } from "@/lib/db/repositories/alertRepository";
import { updateAppSettings } from "@/lib/db/repositories/appSettingsRepository";
import { insertSituationOverview } from "@/lib/db/repositories/situationOverviewRepository";
import { ApiInputError } from "@/lib/services/apiValidation";
import { maxAlertEventsPerWindow, maxSnapshotsPerWindow } from "./insights.rules";
import { getInsights } from "./insights.service";
import type { InsightSection, InsightSectionId, InsightsResponse } from "./insights.types";

const now = new Date("2026-09-19T11:04:00.000Z");

function section(response: InsightsResponse, id: InsightSectionId): InsightSection {
  const found = response.sections.find((entry) => entry.id === id);
  assert.ok(found, `missing section ${id}`);
  return found;
}

function seedSnapshot(db: Database.Database, generatedAt: string, overrides: Record<string, unknown> = {}) {
  return insertSituationOverview(db, {
    symbol: "BTCUSDT",
    timeframe: "1h",
    generatedAt,
    title: "BTC is bullish with moderate risk",
    summary: "Trend and volume support the move.",
    bias: "bullish",
    riskLevel: "moderate",
    confidence: "medium",
    score: 42,
    riskScore: 48,
    mainDriversJson: JSON.stringify([
      { id: "d-trend", label: "Trend Strength", direction: "bullish", strength: "high", explanation: "x", sourceWidget: "trend_strength" }
    ]),
    conflictingSignalsJson: JSON.stringify([]),
    watchConditionsJson: JSON.stringify([]),
    dataWarningsJson: JSON.stringify([]),
    changesJson: JSON.stringify([]),
    sourceWidgetsJson: JSON.stringify([]),
    metaJson: JSON.stringify({ missingInputs: [], staleInputs: [], usedFallbacks: [], isPartial: false }),
    ...overrides
  });
}

function seedAlertRule(db: Database.Database, userId: number) {
  return insertAlertRule(db, {
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
}

function seedAlertEvent(db: Database.Database, ruleId: number, userId: number, triggerKey: string, title = "Bias changed") {
  return insertAlertEvent(db, {
    ruleId,
    userId,
    symbol: "BTCUSDT",
    timeframe: "1h",
    triggerKey,
    severity: "warning",
    title,
    message: "BTC bias changed.",
    explanation: "The weighted widget mix changed.",
    sourceWidget: null,
    overviewId: null,
    metadataJson: "{}"
  });
}

/**
 * Wraps a database so the test can read the parameters the service handed to
 * each prepared statement, which is where the per-table bound formatting and
 * the row caps are observable.
 */
function recordingDatabase(db: Database.Database) {
  const calls: Array<{ sql: string; params: Record<string, unknown> }> = [];
  const proxy = new Proxy(db, {
    get(target, property, receiver) {
      if (property === "prepare") {
        return (sql: string) => {
          const statement = target.prepare(sql);

          return new Proxy(statement, {
            get(statementTarget, statementProperty) {
              const value = Reflect.get(statementTarget, statementProperty) as unknown;

              if (typeof value !== "function") {
                return value;
              }

              return (...args: unknown[]) => {
                if (statementProperty === "all" || statementProperty === "get") {
                  calls.push({ sql, params: (args[0] ?? {}) as Record<string, unknown> });
                }

                return (value as (...inner: unknown[]) => unknown).apply(statementTarget, args);
              };
            }
          });
        };
      }

      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    }
  });

  return { db: proxy as Database.Database, calls };
}

function tableCounts(db: Database.Database) {
  return ["situation_overviews", "alert_events", "widget_results"].map((table) => ({
    table,
    total: (db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get() as { total: number }).total,
    rows: JSON.stringify(db.prepare(`SELECT * FROM ${table} ORDER BY id`).all())
  }));
}

describe("insights service", () => {
  it("formats each window bound for the table it is read against, and caps each read", () => {
    const base = createTestDatabase();
    const session = createTestSession(base, "analyst");
    const recording = recordingDatabase(base);

    getInsights({ session, symbol: "BTCUSDT", timeframe: "1h", range: "7d", db: recording.db, now });

    const snapshotRead = recording.calls.find((call) => call.sql.includes("FROM situation_overviews"));
    assert.ok(snapshotRead);
    assert.equal(snapshotRead.params.from, "2026-09-12T11:04:00.000Z");
    assert.equal(snapshotRead.params.to, "2026-09-19T11:04:00.000Z");
    assert.equal(snapshotRead.params.limit, maxSnapshotsPerWindow);

    const alertRead = recording.calls.find((call) => call.sql.includes("FROM alert_events"));
    assert.ok(alertRead);
    assert.equal(alertRead.params.from, "2026-09-12 11:04:00");
    assert.equal(alertRead.params.to, "2026-09-19 11:04:00");
    assert.equal(alertRead.params.limit, maxAlertEventsPerWindow);
  });

  it("includes both bounds exactly and excludes a row a millisecond outside", () => {
    const db = createTestDatabase();
    const session = createTestSession(db, "viewer");

    seedSnapshot(db, "2026-09-12T11:03:59.999Z");
    const lowerBound = seedSnapshot(db, "2026-09-12T11:04:00.000Z");
    const middle = seedSnapshot(db, "2026-09-15T00:00:00.000Z");
    const upperBound = seedSnapshot(db, "2026-09-19T11:04:00.000Z");
    seedSnapshot(db, "2026-09-19T11:04:00.001Z");

    const response = getInsights({ session, db, now, range: "7d" });

    assert.equal(response.snapshotCount, 3);
    assert.deepEqual(response.coveredWindow, {
      from: "2026-09-12T11:04:00.000Z",
      to: "2026-09-19T11:04:00.000Z"
    });
    // Oldest-first by the time the sections are built.
    assert.deepEqual(section(response, "window-coverage").lines[0].sourceRows, [
      { table: "situation_overviews", ids: [lowerBound, middle, upperBound] }
    ]);
  });

  it("reads an event stored through the datetime('now') default as ISO at the same instant", () => {
    const db = createTestDatabase();
    const session = createTestSession(db, "analyst");
    const ruleId = seedAlertRule(db, session.userId as number);
    const eventId = seedAlertEvent(db, ruleId, session.userId as number, "one");
    const stored = (
      db.prepare("SELECT created_at FROM alert_events WHERE id = ?").get(eventId) as { created_at: string }
    ).created_at;

    const response = getInsights({ session, db, now: new Date(), range: "7d" });
    const activity = section(response, "alert-activity");

    assert.equal(activity.coverage, "reported");
    const group = activity.lines.find((entry) => entry.id === "alert-group-0");
    assert.ok(group);
    assert.equal(group.values.mostRecentAt, `${stored.replace(" ", "T")}Z`);
    assert.match(String(group.values.mostRecentAt), /Z$/);
    assert.equal(
      Date.parse(String(group.values.mostRecentAt)),
      Date.parse(`${stored.replace(" ", "T")}Z`)
    );
  });

  it("survives a row whose stored JSON will not parse", () => {
    const db = createTestDatabase();
    const session = createTestSession(db, "viewer");

    seedSnapshot(db, "2026-09-15T00:00:00.000Z");
    seedSnapshot(db, "2026-09-16T00:00:00.000Z", { mainDriversJson: "{not json" });
    seedSnapshot(db, "2026-09-17T00:00:00.000Z");

    const response = getInsights({ session, db, now, range: "7d" });

    assert.equal(response.snapshotCount, 3);
    assert.equal(section(response, "recurring-drivers").coverage, "reported");
    assert.deepEqual(
      section(response, "recurring-drivers").lines.map((entry) => entry.text),
      ["Trend Strength was a main driver in 2 of 3 snapshots, holding bullish."]
    );
  });

  it("returns a null covered window when nothing was stored", () => {
    const db = createTestDatabase();
    const response = getInsights({ session: createTestSession(db, "viewer"), db, now, range: "7d" });

    assert.equal(response.coveredWindow, null);
    assert.equal(response.snapshotCount, 0);
    assert.equal(response.truncated, false);
    assert.equal(response.sections.length, 8);
  });

  it("omits alert activity for a viewer and still answers with the market sections", () => {
    const db = createTestDatabase();
    const session = createTestSession(db, "viewer");

    seedSnapshot(db, "2026-09-15T00:00:00.000Z");
    seedSnapshot(db, "2026-09-16T00:00:00.000Z");
    seedSnapshot(db, "2026-09-17T00:00:00.000Z");

    const response = getInsights({ session, db, now, range: "7d" });

    assert.equal(section(response, "alert-activity").coverage, "omitted");
    assert.deepEqual(
      response.sections.filter((entry) => entry.category === "market").map((entry) => entry.coverage),
      ["reported", "reported", "reported", "reported", "reported", "reported", "reported"]
    );
  });

  it("computes alert activity from the signed-in analyst's own events", () => {
    const db = createTestDatabase();
    const session = createTestSession(db, "analyst");
    const userId = session.userId as number;
    const ruleId = seedAlertRule(db, userId);

    seedAlertEvent(db, ruleId, userId, "one");
    seedAlertEvent(db, ruleId, userId, "two");

    const response = getInsights({ session, db, now: new Date(), range: "7d" });
    const activity = section(response, "alert-activity");

    assert.equal(activity.coverage, "reported");
    assert.equal(activity.lines[0].text, "2 alert events were raised for your account in this window.");
  });

  it("keeps one user's alert events out of another user's response", () => {
    const db = createTestDatabase();
    const first = createTestSession(db, "analyst", "first@example.com");
    const second = createTestSession(db, "analyst", "second@example.com");
    const firstRule = seedAlertRule(db, first.userId as number);
    const secondRule = seedAlertRule(db, second.userId as number);
    const firstEvent = seedAlertEvent(db, firstRule, first.userId as number, "one", "Only the first user's alert");

    seedAlertEvent(db, secondRule, second.userId as number, "two", "Only the second user's alert");

    const response = getInsights({ session: second, db, now: new Date(), range: "7d" });
    const activity = section(response, "alert-activity");
    const rendered = JSON.stringify(activity);

    assert.equal(activity.lines[0].text, "1 alert event was raised for your account in this window.");
    assert.equal(rendered.includes("Only the first user's alert"), false);
    assert.equal(
      activity.lines.some((entry) => entry.sourceRows.some((rows) => rows.ids.includes(firstEvent))),
      false
    );
  });

  it("answers the public-dashboard anonymous visitor with the market sections", () => {
    const db = createTestDatabase();
    updateAppSettings(db, { publicDashboard: true });
    const anonymous = anonymousTestSession(db);

    seedSnapshot(db, "2026-09-15T00:00:00.000Z");
    seedSnapshot(db, "2026-09-16T00:00:00.000Z");
    seedSnapshot(db, "2026-09-17T00:00:00.000Z");

    const response = getInsights({ session: anonymous, db, now, range: "7d" });

    assert.equal(anonymous.userId, null);
    assert.equal(section(response, "window-coverage").coverage, "reported");
    assert.equal(section(response, "alert-activity").coverage, "omitted");
  });

  it("writes nothing at all", () => {
    const db = createTestDatabase();
    const session = createTestSession(db, "analyst");
    const userId = session.userId as number;
    const ruleId = seedAlertRule(db, userId);

    seedSnapshot(db, "2026-09-15T00:00:00.000Z");
    seedSnapshot(db, "2026-09-16T00:00:00.000Z");
    seedAlertEvent(db, ruleId, userId, "one");

    const before = tableCounts(db);

    getInsights({ session, db, now, range: "7d" });
    getInsights({ session, db, now, range: "30d" });

    assert.deepEqual(tableCounts(db), before);
  });

  it("returns a value rather than a promise", () => {
    const db = createTestDatabase();
    const response = getInsights({ session: createTestSession(db, "viewer"), db, now });

    assert.equal(response instanceof Promise, false);
    assert.equal(response.range, "7d");
    assert.equal(response.generatedAt, "2026-09-19T11:04:00.000Z");
  });

  it("rejects a symbol outside the session's accessible symbols", () => {
    const db = createTestDatabase();
    const viewer = createTestSession(db, "viewer");
    const narrowed = { ...viewer, accessibleSymbols: ["BTCUSDT"] };

    assert.throws(
      () => getInsights({ session: narrowed, symbol: "ETHUSDT", db, now }),
      (error: unknown) => error instanceof ApiInputError && error.statusCode === 400
    );
  });

  it("rejects a range token used as a timeframe", () => {
    const db = createTestDatabase();

    assert.throws(
      () => getInsights({ session: createTestSession(db, "viewer"), timeframe: "7d", db, now }),
      (error: unknown) => error instanceof ApiInputError && error.message === "Unsupported timeframe: 7d"
    );
  });
});
