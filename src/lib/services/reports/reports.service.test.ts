import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type Database from "better-sqlite3";
import { AccessError } from "@/lib/auth/access";
import { anonymousTestSession, createTestDatabase, createTestSession } from "@/lib/auth/testing";
import { appConfig } from "@/lib/config/appConfig";
import type { AppSymbolConfig } from "@/lib/config/symbols";
import { insertAlertEvent, insertAlertRule } from "@/lib/db/repositories/alertRepository";
import { updateAppSettings } from "@/lib/db/repositories/appSettingsRepository";
import { upsertCandles } from "@/lib/db/repositories/candlesRepository";
import { insertPortfolioItem } from "@/lib/db/repositories/portfolioRepository";
import { insertSituationOverview } from "@/lib/db/repositories/situationOverviewRepository";
import { insertWidgetResult } from "@/lib/db/repositories/widgetResultsRepository";
import { ApiInputError } from "@/lib/services/apiValidation";
import { getInsights, windowForRange } from "@/lib/services/insights/insights.service";
import type { InsightRange } from "@/lib/services/insights/insights.types";
import { serializeReport } from "./reports.serialize";
import { buildReportDocument, generateReport, maxReportPairs } from "./reports.service";
import type { GeneratedReport, ReportDocument, ReportSectionId } from "./reports.types";

const now = new Date("2026-09-22T11:04:00.000Z");
const insideWindow = "2026-09-20T09:00:00.000Z";

function section(document: ReportDocument, id: ReportSectionId) {
  const found = document.sections.find((entry) => entry.id === id);
  assert.ok(found, `missing section ${id}`);
  return found;
}

function factValue(document: ReportDocument, id: ReportSectionId, key: string) {
  for (const entry of section(document, id).entries) {
    const found = entry.facts.find((fact) => fact.key === key);

    if (found) {
      return found.value;
    }
  }

  assert.fail(`missing fact ${id}.${key}`);
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
      {
        id: "d-trend",
        label: "Trend Strength",
        direction: "bullish",
        strength: "high",
        explanation: "x",
        sourceWidget: "trend_strength"
      }
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

function seedAlertEvent(
  db: Database.Database,
  ruleId: number,
  userId: number,
  triggerKey: string,
  title = "Bias changed"
) {
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
 * `created_at` takes the `datetime('now')` column default, so an event is
 * seeded through the repository and then moved to the instant the case needs,
 * in the stored format: UTC, space separator, no `T` and no zone marker.
 */
function storeEventAt(db: Database.Database, id: number, storedAt: string) {
  db.prepare("UPDATE alert_events SET created_at = ? WHERE id = ?").run(storedAt, id);
}

function seedWidgetResult(db: Database.Database, symbol: string, timeframe: string) {
  insertWidgetResult(db, {
    widgetId: "trend_strength",
    symbol,
    timeframe,
    score: 34,
    direction: "bullish",
    confidence: 0.62,
    severity: "low",
    summary: "Price is above both moving averages with rising structure.",
    detailsJson: JSON.stringify({ structure: "higher_lows" }),
    sourcesJson: JSON.stringify([])
  });
}

function seedCandle(db: Database.Database, symbol: string, close: number) {
  upsertCandles(db, [
    {
      symbol,
      timeframe: "1h",
      openTime: 1760000000000,
      closeTime: 1760003600000,
      open: close - 10,
      high: close + 50,
      low: close - 50,
      close,
      volume: 1000,
      source: "binance"
    }
  ]);
}

function tableCounts(db: Database.Database) {
  return ["alert_events", "widget_results", "source_runs"].map((table) => ({
    table,
    total: (db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get() as { total: number }).total,
    rows: JSON.stringify(db.prepare(`SELECT * FROM ${table} ORDER BY id`).all())
  }));
}

function overviewCount(db: Database.Database) {
  return (db.prepare("SELECT COUNT(*) AS total FROM situation_overviews").get() as { total: number }).total;
}

/**
 * Only three symbols are configured and active, so the pair cap is reachable
 * only by widening the configured set for the duration of one case.
 */
async function withExtraSymbols<T>(count: number, run: (symbols: string[]) => Promise<T>) {
  const original = [...appConfig.symbols];
  const added: AppSymbolConfig[] = Array.from({ length: count }, (_value, index) => ({
    symbol: `CAP${String(index).padStart(2, "0")}USDT`,
    assetType: "crypto",
    baseAsset: `CAP${index}`,
    quoteAsset: "USDT",
    source: "binance",
    displayName: `Cap ${index}`,
    providerSymbol: `CAP${String(index).padStart(2, "0")}USDT`,
    priceUnit: "USDT",
    isActive: true
  }));

  appConfig.symbols = [...original, ...added];

  try {
    return await run(added.map((symbol) => symbol.symbol));
  } finally {
    appConfig.symbols = original;
  }
}

async function statusOf(run: () => Promise<unknown>) {
  try {
    await run();
    return 200;
  } catch (error) {
    if (error instanceof ApiInputError || error instanceof AccessError) {
      return error.statusCode;
    }

    throw error;
  }
}

describe("report composition", () => {
  it("defaults to all six sections in display order", async () => {
    const db = createTestDatabase();
    const report = await generateReport({ session: createTestSession(db, "analyst"), db, now });

    assert.deepEqual(
      report.document.sections.map((entry) => entry.id),
      ["situation", "widgets", "insights", "radar", "portfolio", "alerts"]
    );
    assert.equal(report.document.scope.pairs.length, 3);
  });

  it("returns only the named sections, still in display order", async () => {
    const db = createTestDatabase();
    const report = await generateReport({
      session: createTestSession(db, "analyst"),
      db,
      now,
      // The parameter's own order is ignored; display order is fixed.
      sections: ["insights", "situation"]
    });

    assert.deepEqual(
      report.document.sections.map((entry) => entry.id),
      ["situation", "insights"]
    );
  });

  it("gives every section the one `now` the report was generated at", async () => {
    const db = createTestDatabase();
    const report = await generateReport({
      session: createTestSession(db, "viewer"),
      db,
      now,
      symbols: ["BTCUSDT"],
      timeframes: ["1h"],
      sections: ["insights"]
    });

    assert.equal(report.document.generatedAt, now.toISOString());
    assert.deepEqual(report.document.window, windowForRange("7d", now));
    assert.equal(report.filename, "laripulse-report-BTCUSDT-1h-20260922T110400Z.md");
    assert.equal(factValue(report.document, "insights", "snapshots"), "0");
  });

  it("uses the window `getInsights` computes, for all four ranges", async () => {
    const db = createTestDatabase();
    const session = createTestSession(db, "viewer");

    for (const range of ["1d", "7d", "30d", "90d"] as InsightRange[]) {
      const insights = getInsights({ session, symbol: "BTCUSDT", timeframe: "1h", range, db, now });

      assert.deepEqual(windowForRange(range, now), insights.requestedWindow);

      const report = await generateReport({
        session,
        db,
        now,
        range,
        symbols: ["BTCUSDT"],
        timeframes: ["1h"],
        sections: ["insights"]
      });

      assert.deepEqual(report.document.window, insights.requestedWindow);
    }
  });

  it("keeps the snapshot its own situation section wrote out of the insights section", async () => {
    const db = createTestDatabase();
    const session = createTestSession(db, "viewer");
    seedSnapshot(db, insideWindow);

    const before = getInsights({ session, symbol: "BTCUSDT", timeframe: "1h", range: "7d", db, now });
    assert.equal(before.snapshotCount, 1);

    const report = await generateReport({
      session,
      db,
      now,
      symbols: ["BTCUSDT"],
      timeframes: ["1h"],
      sections: ["situation", "insights"]
    });

    // The situation section persisted a snapshot stamped `now`, which falls
    // inside the insights window — and the insights section still reports the
    // one row that existed when the report was asked for.
    assert.equal(overviewCount(db), 2);
    assert.equal(factValue(report.document, "insights", "snapshots"), "1");
    assert.equal(
      factValue(report.document, "insights", "window-coverage").includes(insideWindow),
      true
    );
  });

  it("carries seven of the eight insight sections and drops alert activity", async () => {
    const db = createTestDatabase();
    const session = createTestSession(db, "analyst");
    const rule = seedAlertRule(db, session.userId!);
    seedAlertEvent(db, rule, session.userId!, "trigger-1");
    seedSnapshot(db, insideWindow);

    const report = await generateReport({
      session,
      db,
      now,
      symbols: ["BTCUSDT"],
      timeframes: ["1h"],
      sections: ["insights"]
    });
    const facts = section(report.document, "insights").entries[0].facts;
    const carried = facts.map((fact) => fact.key);

    assert.equal(carried.includes("alert-activity"), false);
    assert.deepEqual(carried, [
      "snapshots",
      "covered-window",
      "window-coverage",
      "bias-transitions",
      "risk-transitions",
      "recurring-drivers",
      "persistent-conflicts",
      "watch-conditions",
      "data-coverage"
    ]);
  });

  it("writes no alert event, widget result or source run", async () => {
    const db = createTestDatabase();
    const session = createTestSession(db, "analyst");
    // A rule that would fire for a covered pair: `evaluateAlerts: false` is
    // what keeps generating a document from manufacturing events.
    seedAlertRule(db, session.userId!);
    seedSnapshot(db, insideWindow, { bias: "bearish" });

    const before = tableCounts(db);
    await generateReport({ session, db, now });

    assert.deepEqual(tableCounts(db), before);
  });

  it("keeps a pair with nothing collected in the document with its unknown-state values", async () => {
    const db = createTestDatabase();
    const report = await generateReport({
      session: createTestSession(db, "viewer"),
      db,
      now,
      sections: ["situation", "widgets"]
    });

    assert.deepEqual(
      report.document.scope.pairs.map((pair) => pair.symbol),
      ["BTCUSDT", "ETHUSDT", "SOLUSDT"]
    );
    // `mixed` is what the shared overview builder reports with no inputs at
    // all; the pair is present with that state rather than dropped.
    assert.equal(factValue(report.document, "situation", "bias"), "mixed");
    // A driver list renders as "{label} holding {direction}", never a bare enum.
    assert.equal(factValue(report.document, "situation", "main-drivers").includes(" holding mixed"), true);
    assert.equal(factValue(report.document, "situation", "watch-conditions"), "none");
    assert.deepEqual(
      section(report.document, "situation").entries.map((entry) => entry.scope?.symbol),
      ["BTCUSDT", "ETHUSDT", "SOLUSDT"]
    );
    assert.deepEqual(
      section(report.document, "widgets").entries.map((entry) => entry.scope?.symbol),
      ["BTCUSDT", "ETHUSDT", "SOLUSDT"]
    );
  });

  it("reports a stored widget result under its catalogued title", async () => {
    const db = createTestDatabase();
    seedWidgetResult(db, "BTCUSDT", "1h");

    const report = await generateReport({
      session: createTestSession(db, "viewer"),
      db,
      now,
      symbols: ["BTCUSDT"],
      timeframes: ["1h"],
      sections: ["widgets"]
    });
    const widgets = section(report.document, "widgets");

    assert.equal(widgets.status, "included");
    assert.deepEqual(widgets.entries[0].facts[0], {
      key: "trend_strength",
      label: "Trend Strength",
      value:
        "bullish, score 34, confidence medium: Price is above both moving averages with rising structure."
    });
  });

  it("reports a pair with no widget result at all, and an empty section, from the composition", () => {
    const pair = { symbol: "BTCUSDT", timeframe: "1h" };
    const input = {
      now,
      range: "7d" as const,
      window: windowForRange("7d", now),
      scope: { symbols: ["BTCUSDT"], timeframes: ["1h"], pairs: [pair] },
      sections: ["widgets"] as ReportSectionId[],
      situation: null,
      insights: null,
      radar: null,
      portfolio: null,
      alerts: null
    };
    const empty = buildReportDocument({ ...input, widgets: [{ pair, results: [] }] });
    const mixed = buildReportDocument({
      ...input,
      scope: {
        symbols: ["BTCUSDT", "ETHUSDT"],
        timeframes: ["1h"],
        pairs: [pair, { symbol: "ETHUSDT", timeframe: "1h" }]
      },
      widgets: [
        {
          pair,
          results: [
            {
              id: 1,
              widgetId: "trend_strength",
              symbol: "BTCUSDT",
              timeframe: "1h",
              score: 34,
              direction: "bullish",
              confidence: 0.9,
              severity: "low" as const,
              summary: "Structure is rising.",
              details: {},
              sources: [],
              updatedAt: now.toISOString()
            }
          ]
        },
        { pair: { symbol: "ETHUSDT", timeframe: "1h" }, results: [] }
      ]
    });

    assert.equal(section(empty, "widgets").status, "empty");
    assert.equal(
      section(empty, "widgets").note,
      "No widget result is stored for any of the 1 covered pair."
    );
    assert.deepEqual(section(empty, "widgets").entries, []);
    // Alongside a pair that has results, one without keeps its entry.
    assert.deepEqual(section(mixed, "widgets").entries[1].facts, [
      { key: "no-results", label: "Widgets", value: "Nothing has been collected for this pair." }
    ]);
    assert.equal(
      factValue(mixed, "widgets", "trend_strength"),
      "bullish, score 34, confidence high: Structure is rising."
    );
  });
});

describe("report access", () => {
  it("omits both personal sections for a viewer and still returns the market ones", async () => {
    const db = createTestDatabase();
    const report = await generateReport({ session: createTestSession(db, "viewer"), db, now });

    for (const id of ["portfolio", "alerts"] as ReportSectionId[]) {
      assert.equal(section(report.document, id).status, "omitted");
      assert.deepEqual(section(report.document, id).entries, []);
    }

    assert.equal(
      section(report.document, "portfolio").note,
      "Portfolio is personal to a signed-in account with the analyst role, so it is not included in this report."
    );
    assert.equal(
      section(report.document, "alerts").note,
      "Alert activity is personal to a signed-in account with the analyst role, so it is not included in this report."
    );
    assert.equal(section(report.document, "situation").status, "included");
    assert.equal(section(report.document, "insights").status, "included");
  });

  it("omits an unreadable section a viewer named explicitly rather than failing", async () => {
    const db = createTestDatabase();
    const report = await generateReport({
      session: createTestSession(db, "viewer"),
      db,
      now,
      sections: ["situation", "portfolio"]
    });

    assert.deepEqual(
      report.document.sections.map((entry) => entry.id),
      ["situation", "portfolio"]
    );
    assert.equal(section(report.document, "portfolio").status, "omitted");
  });

  it("gives the public-dashboard anonymous visitor the market sections", async () => {
    const db = createTestDatabase();
    updateAppSettings(db, { publicDashboard: true });
    const anonymous = anonymousTestSession(db);

    assert.equal(anonymous.userId, null);

    const report = await generateReport({ session: anonymous, db, now });

    assert.equal(section(report.document, "situation").status, "included");
    assert.equal(section(report.document, "portfolio").status, "omitted");
    assert.equal(section(report.document, "alerts").status, "omitted");
  });

  it("refuses an anonymous visitor while the public dashboard is off", async () => {
    const db = createTestDatabase();

    assert.equal(await statusOf(() => generateReport({ session: anonymousTestSession(db), db, now })), 401);
  });

  it("composes both personal sections for an analyst from their own rows", async () => {
    const db = createTestDatabase();
    const session = createTestSession(db, "analyst");
    seedCandle(db, "BTCUSDT", 100000);
    insertPortfolioItem(db, {
      userId: session.userId!,
      symbol: "BTCUSDT",
      quantity: 0.12,
      averageCost: 80000,
      quoteCurrency: "USDT",
      label: "Core BTC",
      notes: null,
      includeInRisk: true
    });
    const rule = seedAlertRule(db, session.userId!);
    storeEventAt(db, seedAlertEvent(db, rule, session.userId!, "trigger-1"), "2026-09-20 14:12:09");

    const report = await generateReport({
      session,
      db,
      now,
      symbols: ["BTCUSDT"],
      timeframes: ["1h"],
      sections: ["portfolio", "alerts"]
    });

    assert.equal(section(report.document, "portfolio").status, "included");
    assert.equal(factValue(report.document, "portfolio", "holdings"), "1");
    assert.equal(factValue(report.document, "portfolio", "holding-BTCUSDT"), "0.1200 BTCUSDT, market value 12000.00 USDT");
    assert.equal(section(report.document, "alerts").status, "included");
    assert.equal(factValue(report.document, "alerts", "events-in-window"), "1");
  });

  it("keeps one analyst's rows out of another's document and body", async () => {
    const db = createTestDatabase();
    const owner = createTestSession(db, "analyst", "owner@example.com");
    const other = createTestSession(db, "analyst", "other@example.com");
    seedCandle(db, "ETHUSDT", 4000);
    insertPortfolioItem(db, {
      userId: owner.userId!,
      symbol: "ETHUSDT",
      quantity: 3,
      averageCost: 1000,
      quoteCurrency: "USDT",
      label: "Owner only label",
      notes: "Owner only note",
      includeInRisk: true
    });
    const rule = seedAlertRule(db, owner.userId!);
    storeEventAt(
      db,
      seedAlertEvent(db, rule, owner.userId!, "trigger-owner", "Owner only alert"),
      "2026-09-20 14:12:09"
    );

    const report = await generateReport({
      session: other,
      db,
      now,
      symbols: ["BTCUSDT"],
      timeframes: ["1h"],
      sections: ["portfolio", "alerts"]
    });
    const serialized = JSON.stringify(report.document);

    for (const secret of ["Owner only label", "Owner only note", "Owner only alert", "ETHUSDT"]) {
      assert.equal(serialized.includes(secret), false, `${secret} reached another user's document`);
      assert.equal(report.body.includes(secret), false, `${secret} reached another user's body`);
    }

    assert.equal(section(report.document, "portfolio").status, "empty");
    assert.equal(section(report.document, "alerts").status, "empty");
  });

  it("rejects a symbol outside the session's accessible symbols", async () => {
    const db = createTestDatabase();
    const viewer = createTestSession(db, "viewer");
    const narrowed = { ...viewer, accessibleSymbols: ["BTCUSDT"] };

    assert.equal(await statusOf(() => generateReport({ session: narrowed, db, now, symbols: ["ETHUSDT"] })), 400);
    assert.equal(await statusOf(() => generateReport({ session: narrowed, db, now, symbols: ["BTCUSDT"], sections: ["insights"] })), 200);
  });

  it("rejects a derived timeframe, an unknown section and an unknown format", async () => {
    const db = createTestDatabase();
    const session = createTestSession(db, "viewer");

    assert.equal(await statusOf(() => generateReport({ session, db, now, timeframes: ["30d"] })), 400);
    assert.equal(
      await statusOf(() => generateReport({ session, db, now, sections: ["trades" as ReportSectionId] })),
      400
    );
    assert.equal(
      await statusOf(() => generateReport({ session, db, now, format: "pdf" as "markdown" })),
      400
    );
  });
});

describe("report scope cap", () => {
  it("rejects a scope over the cap by naming its count, before any overview is built", async () => {
    const db = createTestDatabase();
    const viewer = createTestSession(db, "viewer");

    await withExtraSymbols(maxReportPairs + 1, async (symbols) => {
      const session = { ...viewer, accessibleSymbols: [...viewer.accessibleSymbols, ...symbols] };
      const before = overviewCount(db);

      await assert.rejects(
        () => generateReport({ session, db, now, symbols, timeframes: ["1h"] }),
        (error: unknown) =>
          error instanceof ApiInputError &&
          error.statusCode === 400 &&
          error.message === "Report scope covers 25 pairs; the maximum is 24."
      );

      assert.equal(overviewCount(db), before);
    });
  });

  it("accepts a scope of exactly the cap", async () => {
    const db = createTestDatabase();
    const viewer = createTestSession(db, "viewer");

    await withExtraSymbols(maxReportPairs, async (symbols) => {
      const session = { ...viewer, accessibleSymbols: [...viewer.accessibleSymbols, ...symbols] };
      const report = await generateReport({
        session,
        db,
        now,
        symbols,
        timeframes: ["1h"],
        sections: ["insights"]
      });

      assert.equal(report.document.scope.pairs.length, maxReportPairs);
    });
  });
});

describe("report alert window", () => {
  it("selects only the events inside the window and renders their stored instants", async () => {
    const db = createTestDatabase();
    const session = createTestSession(db, "analyst");
    const rule = seedAlertRule(db, session.userId!);

    // The bounds themselves are inside the window; one second outside is not.
    storeEventAt(db, seedAlertEvent(db, rule, session.userId!, "at-from", "At from"), "2026-09-15 11:04:00");
    storeEventAt(db, seedAlertEvent(db, rule, session.userId!, "at-to", "At to"), "2026-09-22 11:04:00");
    storeEventAt(db, seedAlertEvent(db, rule, session.userId!, "before", "Before"), "2026-09-15 11:03:59");
    storeEventAt(db, seedAlertEvent(db, rule, session.userId!, "after", "After"), "2026-09-22 11:04:01");

    const report = await generateReport({
      session,
      db,
      now,
      symbols: ["BTCUSDT"],
      timeframes: ["1h"],
      sections: ["alerts"]
    });
    const facts = section(report.document, "alerts").entries[0].facts;
    const events = facts.filter((fact) => fact.key.startsWith("event-"));

    assert.equal(factValue(report.document, "alerts", "events-in-window"), "2");
    assert.deepEqual(
      events.map((fact) => fact.value),
      ["BTCUSDT 1h: At from", "BTCUSDT 1h: At to"]
    );
    // A local-time parse would shift both; the labels carry the stored instant.
    assert.deepEqual(
      events.map((fact) => fact.label),
      ["2026-09-15T11:04:00Z warning", "2026-09-22T11:04:00Z warning"]
    );
  });

  it("reports an empty window rather than dropping the section", async () => {
    const db = createTestDatabase();
    const session = createTestSession(db, "analyst");
    const rule = seedAlertRule(db, session.userId!);
    storeEventAt(db, seedAlertEvent(db, rule, session.userId!, "old", "Old"), "2026-01-01 00:00:00");

    const report = await generateReport({
      session,
      db,
      now,
      symbols: ["BTCUSDT"],
      timeframes: ["1h"],
      sections: ["alerts"]
    });

    assert.equal(section(report.document, "alerts").status, "empty");
    assert.equal(
      section(report.document, "alerts").note,
      "No alert event was recorded for this account inside the window."
    );
  });
});

describe("report radar note", () => {
  const pairs = Array.from({ length: 24 }, (_value, index) => ({
    symbol: `CAP${index}USDT`,
    timeframe: "1h"
  }));

  function documentWithRadar(itemCount: number) {
    return buildReportDocument({
      now,
      range: "7d",
      window: windowForRange("7d", now),
      scope: { symbols: pairs.map((pair) => pair.symbol), timeframes: ["1h"], pairs },
      sections: ["radar"],
      situation: null,
      widgets: null,
      insights: null,
      radar: {
        items: Array.from({ length: itemCount }, (_value, index) => ({
          symbol: pairs[index].symbol,
          timeframe: "1h",
          rank: index + 1,
          setupScore: 62,
          attentionScore: 40,
          bias: "strong_bullish" as const,
          riskLevel: "moderate" as const,
          confidence: "medium" as const,
          primaryReason: "Trend strength leads with volume confirming.",
          topDrivers: [],
          blockingRisks: [],
          watchConditions: [],
          updatedAt: now.toISOString()
        })),
        scannedSymbols: pairs.map((pair) => pair.symbol),
        scannedTimeframes: ["1h"],
        generatedAt: now.toISOString()
      },
      portfolio: null,
      alerts: null
    });
  }

  it("names the returned and covered counts when the scope is wider than the ranking", () => {
    const document = documentWithRadar(20);

    assert.equal(
      section(document, "radar").note,
      "Ranked pairs are limited to the 20 highest ranking of the 24 covered."
    );
    // Enum wording loses its underscores, the way Insights renders it.
    assert.equal(
      factValue(document, "radar", "rank-1"),
      "strong bullish, risk moderate, setup 62: Trend strength leads with volume confirming."
    );
  });

  it("carries no note when every covered pair is ranked", () => {
    assert.equal(section(documentWithRadar(24), "radar").note, null);
  });

  it("reports an empty radar rather than dropping the section", () => {
    assert.equal(section(documentWithRadar(0), "radar").status, "empty");
  });
});

describe("report serialization", () => {
  it("returns a promise whose body is the document serialized in the requested format", async () => {
    const db = createTestDatabase();
    const session = createTestSession(db, "analyst");

    for (const format of ["markdown", "json", "csv"] as const) {
      const pending = generateReport({
        session,
        db,
        now,
        symbols: ["BTCUSDT"],
        timeframes: ["1h"],
        sections: ["situation"],
        format
      });

      assert.equal(pending instanceof Promise, true);

      const report: GeneratedReport = await pending;

      assert.equal(report.format, format);
      assert.equal(report.body, serializeReport(report.document, format));
      assert.equal(report.document.disclaimer.startsWith("LariPulse produces analytical summaries"), true);
    }
  });
});
