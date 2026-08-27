import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type Database from "better-sqlite3";
import { AccessError } from "@/lib/auth/access";
import { createTestDatabase, createTestSession } from "@/lib/auth/testing";
import { upsertCandles } from "@/lib/db/repositories/candlesRepository";
import { insertPortfolioItem } from "@/lib/db/repositories/portfolioRepository";
import { insertSituationOverview } from "@/lib/db/repositories/situationOverviewRepository";
import { ApiInputError } from "./apiValidation";
import {
  createPortfolioItemForSession,
  deletePortfolioItemForSession,
  getPortfolioCalloutForSymbol,
  getPortfolioContext,
  updatePortfolioItemForSession
} from "./portfolioContextService";

function seedCandle(db: Database.Database, symbol: string, close: number) {
  upsertCandles(db, [{
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
  }]);
}

function seedSituation(db: Database.Database, symbol: string) {
  insertSituationOverview(db, {
    symbol,
    timeframe: "1h",
    generatedAt: "2026-06-01T10:00:00.000Z",
    title: `${symbol} elevated risk`,
    summary: "Liquidity and trend are in conflict.",
    bias: "mixed",
    riskLevel: "elevated",
    confidence: "medium",
    score: 8,
    riskScore: 68,
    mainDriversJson: JSON.stringify([{
      id: "driver-liquidity",
      label: "Liquidity risk",
      direction: "mixed",
      strength: "high",
      explanation: "Observed forced liquidations are one-sided in the selected window.",
      sourceWidget: "liquidations"
    }]),
    conflictingSignalsJson: JSON.stringify([]),
    watchConditionsJson: JSON.stringify([{
      id: "watch-support",
      label: "Support loss",
      condition: "Watch 92000 support.",
      implication: "Risk can rise if price loses the level.",
      severity: "warning",
      sourceWidget: "support_resistance_pressure"
    }]),
    dataWarningsJson: JSON.stringify([]),
    changesJson: JSON.stringify([]),
    sourceWidgetsJson: JSON.stringify([]),
    metaJson: JSON.stringify({ missingInputs: [], staleInputs: [], usedFallbacks: [], isPartial: false })
  });
}

describe("portfolio context service", () => {
  it("enriches local holdings with price, P/L, concentration, and situation context", () => {
    const db = createTestDatabase();
    const session = createTestSession(db, "analyst");
    seedCandle(db, "BTCUSDT", 100000);
    seedCandle(db, "ETHUSDT", 4000);
    seedSituation(db, "BTCUSDT");

    insertPortfolioItem(db, {
      userId: session.userId!,
      symbol: "BTCUSDT",
      quantity: 0.5,
      averageCost: 80000,
      quoteCurrency: "USDT",
      label: "Core BTC",
      notes: null,
      includeInRisk: true
    });
    insertPortfolioItem(db, {
      userId: session.userId!,
      symbol: "ETHUSDT",
      quantity: 0,
      averageCost: null,
      quoteCurrency: "USDT",
      label: "Watch ETH",
      notes: null,
      includeInRisk: true
    });

    const context = getPortfolioContext({ session, db });

    assert.equal(context.items.length, 2);
    assert.equal(context.summary.totalMarketValue, 50000);
    assert.equal(context.summary.totalUnrealizedPnl, 10000);
    assert.equal(context.summary.largestHolding?.symbol, "BTCUSDT");
    assert.equal(context.summary.highestRisk?.symbol, "BTCUSDT");
    assert.equal(context.items[0].situation?.strongestDriver?.label, "Liquidity risk");
    assert.equal(context.items[0].watchConditions[0].label, "Support loss");
  });

  it("keeps each analyst's portfolio private", () => {
    const db = createTestDatabase();
    const owner = createTestSession(db, "analyst", "owner@example.com");
    const other = createTestSession(db, "analyst", "other@example.com");
    const admin = createTestSession(db, "admin");
    const item = createPortfolioItemForSession({ session: owner, db, input: { symbol: "ethusdt", quantity: 1 } });

    assert.equal(item.symbol, "ETHUSDT");
    assert.deepEqual(getPortfolioContext({ session: owner, db }).items.map((entry) => entry.symbol), ["ETHUSDT"]);
    assert.equal(getPortfolioContext({ session: other, db }).items.length, 0);
    assert.equal(getPortfolioContext({ session: admin, db }).items.length, 0);
    assert.equal(getPortfolioCalloutForSymbol({ session: owner, symbol: "ETHUSDT", db })?.quantity, 1);
    assert.equal(getPortfolioCalloutForSymbol({ session: other, symbol: "ETHUSDT", db }), null);

    assert.throws(() => updatePortfolioItemForSession({ session: other, db, id: item.id, input: { quantity: 5 } }), ApiInputError);
    assert.throws(() => deletePortfolioItemForSession({ session: other, db, id: item.id }), ApiInputError);
    assert.equal(deletePortfolioItemForSession({ session: owner, db, id: item.id }), true);
  });

  it("requires the analyst role and a configured symbol", () => {
    const db = createTestDatabase();
    const viewer = createTestSession(db, "viewer");
    const analyst = createTestSession(db, "analyst");

    assert.throws(() => getPortfolioContext({ session: viewer, db }), AccessError);
    assert.throws(
      () => createPortfolioItemForSession({ session: viewer, db, input: { symbol: "BTCUSDT", quantity: 1 } }),
      AccessError
    );
    assert.throws(
      () => createPortfolioItemForSession({ session: analyst, db, input: { symbol: "DOGEUSDT", quantity: 1 } }),
      /Unsupported symbol/
    );
  });
});
