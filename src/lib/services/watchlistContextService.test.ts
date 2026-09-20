import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type Database from "better-sqlite3";
import { AccessError } from "@/lib/auth/access";
import { anonymousTestSession, createTestDatabase, createTestSession } from "@/lib/auth/testing";
import { updateAppSettings } from "@/lib/db/repositories/appSettingsRepository";
import { upsertCandles } from "@/lib/db/repositories/candlesRepository";
import { insertSituationOverview } from "@/lib/db/repositories/situationOverviewRepository";
import { ApiInputError } from "./apiValidation";
import {
  createWatchlistItemForSession,
  deleteWatchlistItemForSession,
  getWatchlistContext,
  updateWatchlistItemForSession
} from "./watchlistContextService";

const hour = 60 * 60 * 1000;

function seedCandle(db: Database.Database, symbol: string, timeframe: string, close: number, closeTime: number) {
  upsertCandles(db, [{
    symbol,
    timeframe,
    openTime: closeTime - hour,
    closeTime,
    open: close - 10,
    high: close + 50,
    low: close - 50,
    close,
    volume: 1000,
    source: "binance"
  }]);
}

function seedSituation(db: Database.Database, symbol: string, timeframe: string, generatedAt: string, title: string) {
  insertSituationOverview(db, {
    symbol,
    timeframe,
    generatedAt,
    title,
    summary: "Price holds the mid-range while momentum cools.",
    bias: "neutral",
    riskLevel: "moderate",
    confidence: "medium",
    score: 51,
    riskScore: 44,
    mainDriversJson: JSON.stringify([{
      id: "trend_strength",
      label: "Trend Strength",
      direction: "neutral",
      strength: "medium",
      explanation: "Moving averages are flat across the window.",
      sourceWidget: "trend_strength"
    }]),
    conflictingSignalsJson: JSON.stringify([]),
    watchConditionsJson: JSON.stringify([{
      id: "range_high_retest",
      label: "Range high retest",
      condition: "Close above 64,900 on 1h",
      implication: "Range resolution upward",
      severity: "info"
    }]),
    dataWarningsJson: JSON.stringify([]),
    changesJson: JSON.stringify([]),
    sourceWidgetsJson: JSON.stringify([]),
    metaJson: JSON.stringify({ missingInputs: [], staleInputs: [], usedFallbacks: [], isPartial: false })
  });
}

function statusOf(action: () => unknown) {
  try {
    action();
    return 200;
  } catch (error) {
    assert.ok(error instanceof AccessError || error instanceof ApiInputError);
    return error.statusCode;
  }
}

describe("watchlist context service", () => {
  it("enriches a pair with its stored price and situation overview", () => {
    const db = createTestDatabase();
    const session = createTestSession(db, "viewer");
    const closeTime = Date.now() - hour;
    seedCandle(db, "BTCUSDT", "1h", 64210.5, closeTime);
    seedSituation(db, "BTCUSDT", "1h", new Date(Date.now() - hour).toISOString(), "Range-bound with easing momentum");

    createWatchlistItemForSession({
      db,
      session,
      input: { symbol: "BTCUSDT", timeframe: "1h", note: "Watching the range high" }
    });

    const context = getWatchlistContext({ db, session });
    const item = context.items[0];

    assert.equal(context.items.length, 1);
    assert.equal(item.symbol, "BTCUSDT");
    assert.equal(item.timeframe, "1h");
    assert.equal(item.note, "Watching the range high");
    assert.equal(item.position, 0);
    assert.equal(item.currentPrice, 64210.5);
    assert.equal(item.priceUpdatedAt, new Date(closeTime).toISOString());
    assert.equal(item.situation?.title, "Range-bound with easing momentum");
    assert.equal(item.situation?.bias, "neutral");
    assert.equal(item.situation?.score, 51);
    assert.equal(item.situation?.riskScore, 44);
    assert.equal(item.situation?.strongestDriver?.id, "trend_strength");
    assert.equal(item.watchConditions.length, 1);
    assert.equal(item.watchConditions[0].id, "range_high_retest");
    assert.equal(item.isStale, false);
    assert.equal("userId" in item, false);
    assert.deepEqual(context.notes, []);
    assert.equal(context.summary.itemCount, 1);
    assert.equal(context.summary.staleCount, 0);
    assert.equal(context.summary.newestStateAt, item.situation?.generatedAt);
  });

  it("reads the row's own timeframe rather than borrowing another one", () => {
    const db = createTestDatabase();
    const session = createTestSession(db, "viewer");
    seedCandle(db, "BTCUSDT", "1h", 64210.5, Date.now() - hour);
    seedSituation(db, "BTCUSDT", "1h", new Date(Date.now() - hour).toISOString(), "One hour view");
    seedCandle(db, "BTCUSDT", "4h", 64500, Date.now() - hour);
    seedSituation(db, "BTCUSDT", "4h", new Date(Date.now() - hour).toISOString(), "Four hour view");

    createWatchlistItemForSession({ db, session, input: { symbol: "BTCUSDT", timeframe: "4h" } });

    const item = getWatchlistContext({ db, session }).items[0];
    assert.equal(item.currentPrice, 64500);
    assert.equal(item.situation?.title, "Four hour view");
  });

  it("reports a missing price without falling back to another timeframe", () => {
    const db = createTestDatabase();
    const session = createTestSession(db, "viewer");
    seedCandle(db, "SOLUSDT", "15m", 180, Date.now() - 10 * 60 * 1000);
    seedSituation(db, "SOLUSDT", "4h", new Date(Date.now() - hour).toISOString(), "Four hour view");

    createWatchlistItemForSession({ db, session, input: { symbol: "SOLUSDT", timeframe: "4h" } });

    const context = getWatchlistContext({ db, session });
    assert.equal(context.items[0].currentPrice, null);
    assert.equal(context.items[0].priceUpdatedAt, null);
    assert.equal(context.summary.missingPriceCount, 1);
    assert.deepEqual(context.notes, ["Missing stored prices for SOLUSDT 4h."]);
  });

  it("reports a missing overview with an empty watch-condition list", () => {
    const db = createTestDatabase();
    const session = createTestSession(db, "viewer");
    seedCandle(db, "ETHUSDT", "1h", 4000, Date.now() - hour);

    createWatchlistItemForSession({ db, session, input: { symbol: "ETHUSDT", timeframe: "1h" } });

    const context = getWatchlistContext({ db, session });
    assert.equal(context.items[0].situation, null);
    assert.deepEqual(context.items[0].watchConditions, []);
    assert.equal(context.summary.missingOverviewCount, 1);
    assert.deepEqual(context.notes, [
      "Run Situation Overview for ETHUSDT 1h to enable state context."
    ]);
    assert.equal(context.summary.newestStateAt, null);
  });

  it("flags a row stale past three intervals of its own timeframe", () => {
    const db = createTestDatabase();
    const session = createTestSession(db, "viewer");
    const now = Date.now();

    // 1h: threshold is 3 hours. Inside it by a minute, outside it by a minute.
    seedCandle(db, "BTCUSDT", "1h", 64000, now - (3 * hour - 60_000));
    seedSituation(db, "BTCUSDT", "1h", new Date(now - (3 * hour - 60_000)).toISOString(), "Fresh enough");
    // 15m: threshold is 45 minutes.
    seedCandle(db, "ETHUSDT", "15m", 4000, now - 46 * 60 * 1000);
    // 1d: threshold is 3 days, and only the overview is old.
    seedCandle(db, "SOLUSDT", "1d", 180, now - hour);
    seedSituation(db, "SOLUSDT", "1d", new Date(now - 4 * 24 * hour).toISOString(), "Days old");

    createWatchlistItemForSession({ db, session, input: { symbol: "BTCUSDT", timeframe: "1h" } });
    createWatchlistItemForSession({ db, session, input: { symbol: "ETHUSDT", timeframe: "15m" } });
    createWatchlistItemForSession({ db, session, input: { symbol: "SOLUSDT", timeframe: "1d" } });

    const context = getWatchlistContext({ db, session });
    assert.deepEqual(
      context.items.map((item) => [item.symbol, item.isStale]),
      [["BTCUSDT", false], ["ETHUSDT", true], ["SOLUSDT", true]]
    );
    assert.equal(context.summary.staleCount, 2);
  });

  it("does not flag a row that has neither a candle nor an overview", () => {
    const db = createTestDatabase();
    const session = createTestSession(db, "viewer");

    createWatchlistItemForSession({ db, session, input: { symbol: "BTCUSDT", timeframe: "1d" } });

    const context = getWatchlistContext({ db, session });
    assert.equal(context.items[0].isStale, false);
    assert.equal(context.summary.staleCount, 0);
    assert.equal(context.summary.missingPriceCount, 1);
    assert.equal(context.summary.missingOverviewCount, 1);
  });

  it("appends new pairs and refuses a duplicate pair", () => {
    const db = createTestDatabase();
    const session = createTestSession(db, "viewer");

    createWatchlistItemForSession({ db, session, input: { symbol: "BTCUSDT", timeframe: "1h" } });
    const second = createWatchlistItemForSession({ db, session, input: { symbol: "ETHUSDT", timeframe: "4h" } });

    assert.equal(second.position, 1);
    assert.equal(second.note, null);
    assert.deepEqual(
      getWatchlistContext({ db, session }).items.map((item) => item.symbol),
      ["BTCUSDT", "ETHUSDT"]
    );

    assert.throws(
      () => createWatchlistItemForSession({ db, session, input: { symbol: "BTCUSDT", timeframe: "1h" } }),
      (error: unknown) =>
        error instanceof ApiInputError &&
        error.statusCode === 400 &&
        error.message === "BTCUSDT 1h is already on your watchlist."
    );

    // A pair on another timeframe is a different row.
    assert.equal(
      createWatchlistItemForSession({ db, session, input: { symbol: "BTCUSDT", timeframe: "4h" } }).position,
      2
    );
    assert.equal(statusOf(() => createWatchlistItemForSession({ db, session, input: { symbol: "BTCUSDT", timeframe: "7d" } })), 400);
    assert.equal(statusOf(() => createWatchlistItemForSession({ db, session, input: { symbol: "DXY", timeframe: "1h" } })), 400);
  });

  it("renumbers densely on reorder and clamps an out-of-range position", () => {
    const db = createTestDatabase();
    const session = createTestSession(db, "viewer");
    const first = createWatchlistItemForSession({ db, session, input: { symbol: "BTCUSDT", timeframe: "1h" } });
    createWatchlistItemForSession({ db, session, input: { symbol: "ETHUSDT", timeframe: "1h" } });
    const third = createWatchlistItemForSession({ db, session, input: { symbol: "SOLUSDT", timeframe: "1h" } });

    updateWatchlistItemForSession({ db, session, id: third.id, input: { position: 0 } });
    assert.deepEqual(
      getWatchlistContext({ db, session }).items.map((item) => [item.symbol, item.position]),
      [["SOLUSDT", 0], ["BTCUSDT", 1], ["ETHUSDT", 2]]
    );

    updateWatchlistItemForSession({ db, session, id: third.id, input: { position: 99 } });
    assert.deepEqual(
      getWatchlistContext({ db, session }).items.map((item) => [item.symbol, item.position]),
      [["BTCUSDT", 0], ["ETHUSDT", 1], ["SOLUSDT", 2]]
    );

    updateWatchlistItemForSession({ db, session, id: first.id, input: { position: -5 } });
    assert.deepEqual(
      getWatchlistContext({ db, session }).items.map((item) => item.symbol),
      ["BTCUSDT", "ETHUSDT", "SOLUSDT"]
    );

    // Deleting keeps the remaining rows dense.
    deleteWatchlistItemForSession({ db, session, id: first.id });
    assert.deepEqual(
      getWatchlistContext({ db, session }).items.map((item) => [item.symbol, item.position]),
      [["ETHUSDT", 0], ["SOLUSDT", 1]]
    );
  });

  it("refuses a patch that carries symbol or timeframe", () => {
    const db = createTestDatabase();
    const session = createTestSession(db, "viewer");
    const item = createWatchlistItemForSession({ db, session, input: { symbol: "BTCUSDT", timeframe: "1h" } });

    assert.equal(
      statusOf(() =>
        updateWatchlistItemForSession({ db, session, id: item.id, input: { symbol: "ETHUSDT" } as never })
      ),
      400
    );
    assert.equal(
      statusOf(() =>
        updateWatchlistItemForSession({ db, session, id: item.id, input: { timeframe: "4h" } as never })
      ),
      400
    );
    assert.equal(getWatchlistContext({ db, session }).items[0].symbol, "BTCUSDT");

    const noted = updateWatchlistItemForSession({ db, session, id: item.id, input: { note: "  kept  " } });
    assert.equal(noted.note, "kept");
    assert.equal(updateWatchlistItemForSession({ db, session, id: item.id, input: { note: "   " } }).note, null);
    assert.equal(
      statusOf(() => updateWatchlistItemForSession({ db, session, id: item.id, input: { note: "x".repeat(281) } })),
      400
    );
  });

  it("keeps one user's rows invisible and untouchable to another", () => {
    const db = createTestDatabase();
    const owner = createTestSession(db, "viewer", "owner@example.com");
    const other = createTestSession(db, "analyst", "other@example.com");
    const item = createWatchlistItemForSession({
      db,
      session: owner,
      input: { symbol: "BTCUSDT", timeframe: "1h", note: "mine" }
    });

    assert.deepEqual(getWatchlistContext({ db, session: other }).items, []);
    assert.equal(
      statusOf(() => updateWatchlistItemForSession({ db, session: other, id: item.id, input: { note: "theirs" } })),
      404
    );
    assert.equal(statusOf(() => deleteWatchlistItemForSession({ db, session: other, id: item.id })), 404);

    const owned = getWatchlistContext({ db, session: owner }).items;
    assert.equal(owned.length, 1);
    assert.equal(owned[0].note, "mine");
  });

  it("refuses anonymous visitors, including a public-dashboard viewer", () => {
    const db = createTestDatabase();
    assert.equal(statusOf(() => getWatchlistContext({ db, session: anonymousTestSession(db) })), 401);

    updateAppSettings(db, { publicDashboard: true });
    const publicViewer = anonymousTestSession(db);

    assert.equal(publicViewer.role, "viewer");
    assert.equal(publicViewer.userId, null);
    assert.equal(statusOf(() => getWatchlistContext({ db, session: publicViewer })), 401);
    assert.equal(
      statusOf(() =>
        createWatchlistItemForSession({ db, session: publicViewer, input: { symbol: "BTCUSDT", timeframe: "1h" } })
      ),
      401
    );
    assert.equal(statusOf(() => deleteWatchlistItemForSession({ db, session: publicViewer, id: 1 })), 401);
  });
});
