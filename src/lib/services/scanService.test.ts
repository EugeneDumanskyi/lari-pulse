import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type Database from "better-sqlite3";
import { AccessError } from "@/lib/auth/access";
import { anonymousTestSession, createTestDatabase, createTestSession } from "@/lib/auth/testing";
import { updateAppSettings } from "@/lib/db/repositories/appSettingsRepository";
import { insertWidgetResult } from "@/lib/db/repositories/widgetResultsRepository";
import { ApiInputError } from "./apiValidation";
import { createRuleForSession } from "./alertService";
import { evaluateScanFilter, parseScanFilter, runScan, type ScanFilter } from "./scanService";
import { getSituationOverview } from "./situationOverview/situationOverview.service";
import type { SituationOverview } from "./situationOverview/situationOverview.types";

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
    score: 40,
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

function filterOf(...conditions: unknown[]): ScanFilter {
  return parseScanFilter({ conditions });
}

function statusOf(run: () => unknown) {
  try {
    run();
    return 200;
  } catch (error) {
    return error instanceof ApiInputError ? error.statusCode : 500;
  }
}

function seedTrend(
  db: Database.Database,
  input: { symbol: string; timeframe: string; score: number; direction: string; confidence?: number }
) {
  insertWidgetResult(db, {
    widgetId: "trend_strength",
    symbol: input.symbol,
    timeframe: input.timeframe,
    score: input.score,
    direction: input.direction,
    confidence: input.confidence ?? 0.82,
    severity: "low",
    summary: `${input.symbol} trend is ${input.direction}.`,
    detailsJson: JSON.stringify({ structure: "higher_lows" }),
    sourcesJson: JSON.stringify([])
  });
}

describe("scan filter evaluation", () => {
  it("reports the bias condition with its label and the value found", () => {
    const match = evaluateScanFilter(
      filterOf({ type: "bias", in: ["bullish", "strong_bullish"] }),
      overview({ bias: "bearish" })
    );

    assert.equal(match.matched, false);
    assert.deepEqual(match.matchedConditions, []);
    assert.deepEqual(match.unmatchedConditions, [{
      id: "c0",
      type: "bias",
      label: "Bias is bullish or strong bullish",
      actual: "bearish"
    }]);
  });

  it("reports the risk level condition", () => {
    const match = evaluateScanFilter(
      filterOf({ type: "risk_level", in: ["low", "moderate"] }),
      overview({ riskLevel: "elevated" })
    );

    assert.equal(match.matched, false);
    assert.deepEqual(match.unmatchedConditions, [{
      id: "c0",
      type: "risk_level",
      label: "Risk level is low or moderate",
      actual: "elevated"
    }]);
  });

  it("reports the confidence condition", () => {
    const match = evaluateScanFilter(
      filterOf({ type: "confidence", in: ["high"] }),
      overview({ confidence: "medium" })
    );

    assert.deepEqual(match.unmatchedConditions, [{
      id: "c0",
      type: "confidence",
      label: "Confidence is high",
      actual: "medium"
    }]);
  });

  it("compares the directional score strictly", () => {
    const condition = { type: "score", operator: "above", value: 40 };

    const atBoundary = evaluateScanFilter(filterOf(condition), overview({ score: 40 }));
    assert.equal(atBoundary.matched, false);
    assert.deepEqual(atBoundary.unmatchedConditions, [{
      id: "c0",
      type: "score",
      label: "Directional score is above 40",
      actual: "score 40"
    }]);

    const above = evaluateScanFilter(filterOf(condition), overview({ score: 41 }));
    assert.equal(above.matched, true);
    assert.deepEqual(above.matchedConditions, [{
      id: "c0",
      type: "score",
      label: "Directional score is above 40",
      actual: "score 41"
    }]);
  });

  it("reaches the negative half of the directional score scale", () => {
    const match = evaluateScanFilter(
      filterOf({ type: "score", operator: "below", value: 0 }),
      overview({ score: -62 })
    );

    assert.equal(match.matched, true);
    assert.deepEqual(match.matchedConditions, [{
      id: "c0",
      type: "score",
      label: "Directional score is below 0",
      actual: "score -62"
    }]);
  });

  it("compares the risk score at both ends of its range", () => {
    const below = evaluateScanFilter(
      filterOf({ type: "risk_score", operator: "below", value: 50 }),
      overview({ riskScore: 63 })
    );

    assert.equal(below.matched, false);
    assert.deepEqual(below.unmatchedConditions, [{
      id: "c0",
      type: "risk_score",
      label: "Risk score is below 50",
      actual: "risk score 63"
    }]);

    assert.equal(
      evaluateScanFilter(filterOf({ type: "risk_score", operator: "above", value: 0 }), overview({ riskScore: 0 }))
        .matched,
      false
    );
    assert.equal(
      evaluateScanFilter(filterOf({ type: "risk_score", operator: "below", value: 100 }), overview({ riskScore: 100 }))
        .matched,
      false
    );
    assert.equal(
      evaluateScanFilter(filterOf({ type: "risk_score", operator: "below", value: 100 }), overview({ riskScore: 99 }))
        .matched,
      true
    );
  });

  it("restricts main_driver position top to the first main driver", () => {
    const drivers = overview({
      mainDrivers: [
        {
          id: "driver-momentum_exhaustion",
          label: "Momentum Exhaustion",
          direction: "bearish",
          strength: "high",
          explanation: "Momentum is stretched.",
          sourceWidget: "momentum_exhaustion"
        },
        {
          id: "driver-trend_strength",
          label: "Trend Strength",
          direction: "bullish",
          strength: "medium",
          explanation: "Trend still supports the move.",
          sourceWidget: "trend_strength"
        }
      ]
    });

    const top = evaluateScanFilter(
      filterOf({ type: "main_driver", widgetIds: ["trend_strength"], position: "top" }),
      drivers
    );

    assert.equal(top.matched, false);
    assert.deepEqual(top.unmatchedConditions, [{
      id: "c0",
      type: "main_driver",
      label: "Trend Strength is the top main driver",
      actual: "Momentum Exhaustion"
    }]);

    const any = evaluateScanFilter(filterOf({ type: "main_driver", widgetIds: ["trend_strength"] }), drivers);

    assert.equal(any.matched, true);
    assert.deepEqual(any.matchedConditions, [{
      id: "c0",
      type: "main_driver",
      label: "Trend Strength is a main driver",
      actual: "Momentum Exhaustion, Trend Strength"
    }]);
  });

  it("reports no driver when the named widget drives nothing", () => {
    const match = evaluateScanFilter(
      filterOf({ type: "driver_direction", widgetId: "volume_confirmation", in: ["bullish"] }),
      overview()
    );

    assert.equal(match.matched, false);
    assert.deepEqual(match.unmatchedConditions, [{
      id: "c0",
      type: "driver_direction",
      label: "Volume Confirmation points bullish",
      actual: "no driver"
    }]);
  });

  it("reports the driver direction that was found", () => {
    const match = evaluateScanFilter(
      filterOf({ type: "driver_direction", widgetId: "trend_strength", in: ["bullish"] }),
      overview()
    );

    assert.equal(match.matched, true);
    assert.deepEqual(match.matchedConditions, [{
      id: "c0",
      type: "driver_direction",
      label: "Trend Strength points bullish",
      actual: "bullish"
    }]);
  });

  it("filters watch conditions by minimum severity", () => {
    const withInfo = overview({
      watchConditions: [{
        id: "liquidations-local-history",
        label: "Liquidation event history",
        condition: "Locally observed only.",
        implication: "Treat the history as partial.",
        severity: "info"
      }]
    });

    const present = evaluateScanFilter(
      filterOf({ type: "watch_condition", state: "present", minimumSeverity: "warning" }),
      withInfo
    );

    assert.equal(present.matched, false);
    assert.deepEqual(present.unmatchedConditions, [{
      id: "c0",
      type: "watch_condition",
      label: "A warning or higher watch condition is present",
      actual: "none"
    }]);

    const absent = evaluateScanFilter(
      filterOf({ type: "watch_condition", state: "absent", minimumSeverity: "warning" }),
      withInfo
    );

    assert.equal(absent.matched, true);
    assert.deepEqual(absent.matchedConditions, [{
      id: "c0",
      type: "watch_condition",
      label: "A warning or higher watch condition is absent",
      actual: "none"
    }]);

    const anySeverity = evaluateScanFilter(filterOf({ type: "watch_condition", state: "present" }), withInfo);

    assert.equal(anySeverity.matched, true);
    assert.deepEqual(anySeverity.matchedConditions, [{
      id: "c0",
      type: "watch_condition",
      label: "Any watch condition is present",
      actual: "Liquidation event history"
    }]);
  });

  it("counts conflicting signals by state and by count", () => {
    const conflicted = overview({
      conflictingSignals: [
        {
          id: "conflict-volume",
          label: "Volume Confirmation",
          direction: "bearish",
          strength: "medium",
          explanation: "Volume does not confirm the move."
        },
        {
          id: "conflict-momentum",
          label: "Momentum Exhaustion",
          direction: "bearish",
          strength: "low",
          explanation: "Momentum disagrees."
        }
      ]
    });

    const none = evaluateScanFilter(filterOf({ type: "conflicts", state: "none" }), conflicted);

    assert.equal(none.matched, false);
    assert.deepEqual(none.unmatchedConditions, [{
      id: "c0",
      type: "conflicts",
      label: "No conflicting signals",
      actual: "2 conflicting signals"
    }]);

    const clean = evaluateScanFilter(filterOf({ type: "conflicts", state: "none" }), overview());

    assert.equal(clean.matched, true);
    assert.deepEqual(clean.matchedConditions, [{
      id: "c0",
      type: "conflicts",
      label: "No conflicting signals",
      actual: "0 conflicting signals"
    }]);

    const above = evaluateScanFilter(filterOf({ type: "conflicts", operator: "above", value: 2 }), conflicted);

    assert.equal(above.matched, false);
    assert.deepEqual(above.unmatchedConditions, [{
      id: "c0",
      type: "conflicts",
      label: "Conflicting signals are above 2",
      actual: "2 conflicting signals"
    }]);
  });

  it("requires both freshness inputs to be clean", () => {
    const stale = overview({
      meta: { missingInputs: [], staleInputs: ["trend_strength"], usedFallbacks: [], isPartial: true }
    });

    const fresh = evaluateScanFilter(filterOf({ type: "freshness", state: "fresh" }), stale);

    assert.equal(fresh.matched, false);
    assert.deepEqual(fresh.unmatchedConditions, [{
      id: "c0",
      type: "freshness",
      label: "State is fresh",
      actual: "partial, 1 stale input"
    }]);

    const anyFreshness = evaluateScanFilter(filterOf({ type: "freshness", state: "any" }), stale);

    assert.equal(anyFreshness.matched, true);
    assert.deepEqual(anyFreshness.matchedConditions, [{
      id: "c0",
      type: "freshness",
      label: "Freshness is not checked",
      actual: "partial, 1 stale input"
    }]);

    assert.equal(
      evaluateScanFilter(filterOf({ type: "freshness", state: "fresh" }), overview()).matchedConditions[0]?.actual,
      "fresh"
    );
  });

  it("matches a change id only when the previous snapshot recorded it", () => {
    const unchanged = evaluateScanFilter(
      filterOf({ type: "changed", ids: ["bias-change", "driver-change"] }),
      overview()
    );

    assert.equal(unchanged.matched, false);
    assert.deepEqual(unchanged.unmatchedConditions, [{
      id: "c0",
      type: "changed",
      label: "Bias or main driver changed since the previous snapshot",
      actual: "no recorded change"
    }]);

    const changed = evaluateScanFilter(
      filterOf({ type: "changed", ids: ["bias-change", "driver-change"] }),
      overview({
        changedSincePrevious: [{
          id: "bias-change",
          label: "Bias changed",
          previous: "neutral",
          current: "bullish",
          explanation: "Bias moved from neutral to bullish."
        }]
      })
    );

    assert.equal(changed.matched, true);
    assert.deepEqual(changed.matchedConditions, [{
      id: "c0",
      type: "changed",
      label: "Bias or main driver changed since the previous snapshot",
      actual: "bias"
    }]);
  });

  it("treats a missing changedSincePrevious as no recorded change", () => {
    const withoutField = overview();
    delete withoutField.changedSincePrevious;

    const match = evaluateScanFilter(filterOf({ type: "changed", ids: ["score-change"] }), withoutField);

    assert.equal(match.matched, false);
    assert.equal(match.unmatchedConditions[0]?.actual, "no recorded change");
  });

  it("separates all from any over the same conditions and overview", () => {
    const conditions = [
      { type: "bias", in: ["bullish"] },
      { type: "risk_level", in: ["low"] }
    ];
    const state = overview({ bias: "bullish", riskLevel: "elevated" });

    const all = evaluateScanFilter(parseScanFilter({ match: "all", conditions }), state);
    assert.equal(all.matched, false);
    assert.deepEqual(all.matchedConditions.map((entry) => entry.id), ["c0"]);
    assert.deepEqual(all.unmatchedConditions.map((entry) => entry.id), ["c1"]);

    const any = evaluateScanFilter(parseScanFilter({ match: "any", conditions }), state);
    assert.equal(any.matched, true);
    assert.deepEqual(any.matchedConditions.map((entry) => entry.id), ["c0"]);
    assert.deepEqual(any.unmatchedConditions.map((entry) => entry.id), ["c1"]);

    const allSatisfied = evaluateScanFilter(
      parseScanFilter({ match: "all", conditions }),
      overview({ bias: "bullish", riskLevel: "low" })
    );
    assert.equal(allSatisfied.matched, true);
    assert.deepEqual(allSatisfied.unmatchedConditions, []);
  });
});

describe("scan filter parsing", () => {
  it("rejects every malformed filter with a 400", () => {
    assert.equal(statusOf(() => parseScanFilter("bias")), 400);
    assert.equal(statusOf(() => parseScanFilter([])), 400);
    assert.equal(statusOf(() => parseScanFilter({})), 400);
    assert.equal(statusOf(() => parseScanFilter({ conditions: [] })), 400);
    assert.equal(
      statusOf(() =>
        parseScanFilter({
          conditions: Array.from({ length: 13 }, () => ({ type: "freshness", state: "any" }))
        })
      ),
      400
    );
    assert.equal(statusOf(() => parseScanFilter({ match: "either", conditions: [{ type: "freshness", state: "any" }] })), 400);
    assert.equal(statusOf(() => parseScanFilter({ conditions: ["bias"] })), 400);
    assert.equal(statusOf(() => parseScanFilter({ conditions: [{ type: "sentiment", in: ["hot"] }] })), 400);
    assert.equal(statusOf(() => parseScanFilter({ conditions: [{ type: "bias" }] })), 400);
    assert.equal(statusOf(() => parseScanFilter({ conditions: [{ type: "bias", in: [] }] })), 400);
    assert.equal(statusOf(() => parseScanFilter({ conditions: [{ type: "bias", in: ["sideways"] }] })), 400);
    assert.equal(statusOf(() => parseScanFilter({ conditions: [{ type: "changed", ids: ["volume-change"] }] })), 400);
    assert.equal(statusOf(() => parseScanFilter({ conditions: [{ type: "score", value: 10 }] })), 400);
    assert.equal(statusOf(() => parseScanFilter({ conditions: [{ type: "score", operator: "above", value: "40" }] })), 400);
    assert.equal(statusOf(() => parseScanFilter({ conditions: [{ type: "score", operator: "above", value: 101 }] })), 400);
    assert.equal(statusOf(() => parseScanFilter({ conditions: [{ type: "score", operator: "above", value: -101 }] })), 400);
    assert.equal(statusOf(() => parseScanFilter({ conditions: [{ type: "risk_score", operator: "above", value: -1 }] })), 400);
    assert.equal(statusOf(() => parseScanFilter({ conditions: [{ type: "risk_score", operator: "above", value: 101 }] })), 400);
    assert.equal(
      statusOf(() => parseScanFilter({ conditions: [{ type: "main_driver", widgetIds: ["fear_greed"] }] })),
      400
    );
    assert.equal(
      statusOf(() => parseScanFilter({ conditions: [{ type: "watch_condition", state: "maybe" }] })),
      400
    );

    assert.throws(() => parseScanFilter({ conditions: [] }), ApiInputError);
  });

  it("accepts a score of exactly -100 and 100", () => {
    assert.equal(statusOf(() => parseScanFilter({ conditions: [{ type: "score", operator: "above", value: -100 }] })), 200);
    assert.equal(statusOf(() => parseScanFilter({ conditions: [{ type: "score", operator: "below", value: 100 }] })), 200);
  });

  it("accepts a cross-market widget id the widget registry would reject", () => {
    const filter = parseScanFilter({
      conditions: [{ type: "main_driver", widgetIds: ["risk_regime", "dollar_pressure"] }]
    });

    assert.deepEqual(filter.conditions[0], {
      type: "main_driver",
      widgetIds: ["risk_regime", "dollar_pressure"],
      position: "any"
    });
  });

  it("defaults match to all and position to any", () => {
    const filter = parseScanFilter({ conditions: [{ type: "main_driver", widgetIds: ["trend_strength"] }] });

    assert.equal(filter.match, "all");
    assert.deepEqual(filter.conditions, [{ type: "main_driver", widgetIds: ["trend_strength"], position: "any" }]);
  });
});

describe("scan run", () => {
  const now = new Date("2026-06-01T10:00:00.000Z");

  it("requires at least a viewer", async () => {
    const db = createTestDatabase();

    await assert.rejects(
      () =>
        runScan({
          db,
          session: anonymousTestSession(db),
          filter: filterOf({ type: "freshness", state: "any" }),
          timeframes: ["1h"]
        }),
      AccessError
    );
  });

  it("runs for a public-dashboard anonymous viewer", async () => {
    const db = createTestDatabase();
    updateAppSettings(db, { publicDashboard: true });
    const session = anonymousTestSession(db);
    seedTrend(db, { symbol: "BTCUSDT", timeframe: "1h", score: 82, direction: "bullish" });

    assert.equal(session.role, "viewer");
    assert.equal(session.userId, null);

    const result = await runScan({
      db,
      session,
      filter: filterOf({ type: "freshness", state: "any" }),
      symbols: ["BTCUSDT"],
      timeframes: ["1h"],
      now
    });

    assert.equal(result.summary.examinedPairs, 1);
    assert.equal(result.items.length, 1);
  });

  it("reports a pair with no stored widget results instead of examining it", async () => {
    const db = createTestDatabase();
    const session = createTestSession(db, "viewer");
    seedTrend(db, { symbol: "BTCUSDT", timeframe: "1h", score: 82, direction: "bullish" });

    const result = await runScan({
      db,
      session,
      filter: filterOf({ type: "freshness", state: "any" }),
      symbols: ["BTCUSDT", "ETHUSDT"],
      timeframes: ["1h"],
      now
    });

    assert.deepEqual(result.summary.pairsWithoutState, [{ symbol: "ETHUSDT", timeframe: "1h" }]);
    assert.equal(result.summary.requestedPairs, 2);
    assert.equal(result.summary.examinedPairs, 1);
    assert.deepEqual(result.items.map((item) => item.symbol), ["BTCUSDT"]);
    assert.deepEqual(result.summary.conditionSummary, [{
      id: "c0",
      type: "freshness",
      label: "Freshness is not checked",
      matchedPairCount: 1
    }]);
  });

  it("counts each condition over the examined pairs, including one nothing satisfies", async () => {
    const db = createTestDatabase();
    const session = createTestSession(db, "viewer");
    seedTrend(db, { symbol: "BTCUSDT", timeframe: "1h", score: 88, direction: "bullish" });
    seedTrend(db, { symbol: "ETHUSDT", timeframe: "1h", score: 12, direction: "bearish" });

    const result = await runScan({
      db,
      session,
      filter: parseScanFilter({
        match: "any",
        conditions: [
          { type: "bias", in: ["bullish", "strong_bullish"] },
          { type: "bias", in: ["bearish", "strong_bearish"] },
          { type: "bias", in: ["unknown"] }
        ]
      }),
      symbols: ["BTCUSDT", "ETHUSDT"],
      timeframes: ["1h"],
      now
    });

    assert.equal(result.summary.examinedPairs, 2);
    assert.deepEqual(result.summary.conditionSummary.map((entry) => entry.matchedPairCount), [1, 1, 0]);
    assert.equal(result.summary.matchedPairs, 2);
    assert.deepEqual(result.items.map((item) => item.unmatchedConditions.length), [2, 2]);
  });

  it("orders by the requested symbol order and the collection timeframe order", async () => {
    const db = createTestDatabase();
    const session = createTestSession(db, "viewer");

    for (const symbol of ["BTCUSDT", "ETHUSDT"]) {
      for (const timeframe of ["1h", "4h"]) {
        seedTrend(db, { symbol, timeframe, score: 70, direction: "bullish" });
      }
    }

    const result = await runScan({
      db,
      session,
      filter: filterOf({ type: "freshness", state: "any" }),
      symbols: ["ETHUSDT", "BTCUSDT"],
      timeframes: ["4h", "1h"],
      now
    });

    assert.deepEqual(
      result.items.map((item) => `${item.symbol} ${item.timeframe}`),
      ["ETHUSDT 1h", "ETHUSDT 4h", "BTCUSDT 1h", "BTCUSDT 4h"]
    );
  });

  it("returns identical output for the same stored state and clock", async () => {
    const db = createTestDatabase();
    const session = createTestSession(db, "viewer");
    seedTrend(db, { symbol: "BTCUSDT", timeframe: "1h", score: 88, direction: "bullish" });

    const options = {
      db,
      session,
      filter: filterOf({ type: "bias", in: ["bullish", "strong_bullish"] }),
      symbols: ["BTCUSDT"],
      timeframes: ["1h"],
      now
    };

    assert.deepEqual(await runScan(options), await runScan(options));
  });

  it("writes no alert events even when a rule would fire for the pair", async () => {
    async function seedChangedPair(db: Database.Database, analyst: ReturnType<typeof createTestSession>) {
      seedTrend(db, { symbol: "BTCUSDT", timeframe: "1h", score: 92, direction: "bullish" });
      await getSituationOverview({
        symbol: "BTCUSDT",
        timeframe: "1h",
        session: analyst,
        db,
        now,
        evaluateAlerts: false
      });
      seedTrend(db, { symbol: "BTCUSDT", timeframe: "1h", score: 6, direction: "bearish" });
      createRuleForSession({
        db,
        session: analyst,
        input: { ruleType: "situation_bias_changed", symbol: "BTCUSDT", timeframe: "1h", severity: "warning" }
      });
    }

    function alertEventCount(db: Database.Database) {
      return (db.prepare("SELECT COUNT(*) AS count FROM alert_events").get() as { count: number }).count;
    }

    const later = new Date("2026-06-01T11:00:00.000Z");
    const scanned = createTestDatabase();
    await seedChangedPair(scanned, createTestSession(scanned, "analyst"));

    await runScan({
      db: scanned,
      session: createTestSession(scanned, "viewer", "viewer@example.com"),
      filter: filterOf({ type: "freshness", state: "any" }),
      symbols: ["BTCUSDT"],
      timeframes: ["1h"],
      now: later
    });

    assert.equal(alertEventCount(scanned), 0);

    // The same state with alert evaluation on does produce an event, so the
    // zero above is `evaluateAlerts: false` and not an inert fixture.
    const control = createTestDatabase();
    const controlAnalyst = createTestSession(control, "analyst");
    await seedChangedPair(control, controlAnalyst);
    await getSituationOverview({
      symbol: "BTCUSDT",
      timeframe: "1h",
      session: controlAnalyst,
      db: control,
      now: later,
      evaluateAlerts: true
    });

    assert.ok(alertEventCount(control) > 0);
  });

  it("truncates items with limit while counting every matched pair", async () => {
    const db = createTestDatabase();
    const session = createTestSession(db, "viewer");

    for (const timeframe of ["15m", "1h", "4h"]) {
      seedTrend(db, { symbol: "BTCUSDT", timeframe, score: 88, direction: "bullish" });
    }

    const result = await runScan({
      db,
      session,
      filter: filterOf({ type: "freshness", state: "any" }),
      symbols: ["BTCUSDT"],
      timeframes: ["15m", "1h", "4h"],
      limit: 2,
      now
    });

    assert.equal(result.items.length, 2);
    assert.equal(result.summary.matchedPairs, 3);
  });
});
