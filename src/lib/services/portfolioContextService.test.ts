import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { createAdminSession, getSessionFromToken } from "@/lib/auth/access";
import { runMigrations } from "@/lib/db/migrations";
import { upsertCandles } from "@/lib/db/repositories/candlesRepository";
import { insertPortfolioItem } from "@/lib/db/repositories/portfolioRepository";
import { insertSituationOverview } from "@/lib/db/repositories/situationOverviewRepository";
import {
  createPortfolioItemForSession,
  getPortfolioContext
} from "./portfolioContextService";

function createMemoryDatabase() {
  const db = new Database(":memory:");
  runMigrations(db);
  return db;
}

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

function seedSituation(db: Database.Database, symbol: string, accessPlan = "enterprise") {
  insertSituationOverview(db, {
    symbol,
    timeframe: "1h",
    accessPlan,
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
    const db = createMemoryDatabase();
    const session = createAdminSession();
    seedCandle(db, "BTCUSDT", 100000);
    seedCandle(db, "ETHUSDT", 4000);
    seedSituation(db, "BTCUSDT");

    insertPortfolioItem(db, {
      symbol: "BTCUSDT",
      quantity: 0.5,
      averageCost: 80000,
      quoteCurrency: "USDT",
      label: "Core BTC",
      notes: null,
      includeInRisk: true
    });
    insertPortfolioItem(db, {
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

  it("scopes portfolio reads and writes to the current local access level", () => {
    const db = createMemoryDatabase();
    const basicSession = getSessionFromToken(undefined);

    insertPortfolioItem(db, {
      symbol: "BTCUSDT",
      quantity: 1,
      averageCost: null,
      quoteCurrency: "USDT",
      label: null,
      notes: null,
      includeInRisk: true
    });
    insertPortfolioItem(db, {
      symbol: "ETHUSDT",
      quantity: 1,
      averageCost: null,
      quoteCurrency: "USDT",
      label: null,
      notes: null,
      includeInRisk: true
    });

    const context = getPortfolioContext({ session: basicSession, db });
    assert.deepEqual(context.items.map((item) => item.symbol), ["BTCUSDT"]);

    assert.throws(
      () => createPortfolioItemForSession({
        session: basicSession,
        db,
        input: {
          symbol: "ETHUSDT",
          quantity: 1
        }
      }),
      /locked/
    );
  });
});
