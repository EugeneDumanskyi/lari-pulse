import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { runMigrations } from "@/lib/db/migrations";
import {
  getLatestSituationOverview,
  insertSituationOverview,
  listSituationOverviewHistory
} from "./situationOverviewRepository";

function createMemoryDatabase() {
  const db = new Database(":memory:");
  runMigrations(db);
  return db;
}

function overview(generatedAt: string, overrides: Partial<Parameters<typeof insertSituationOverview>[1]> = {}) {
  return {
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
    mainDriversJson: JSON.stringify([{ id: "driver-trend", label: "Trend" }]),
    conflictingSignalsJson: JSON.stringify([]),
    watchConditionsJson: JSON.stringify([]),
    dataWarningsJson: JSON.stringify([]),
    changesJson: JSON.stringify([]),
    sourceWidgetsJson: JSON.stringify([]),
    metaJson: JSON.stringify({ isPartial: false }),
    ...overrides
  };
}

describe("situation overview repository", () => {
  it("stores, reads latest, and lists history per symbol and timeframe", () => {
    const db = createMemoryDatabase();

    insertSituationOverview(db, overview("2026-06-01T10:00:00.000Z", { score: 20 }));
    insertSituationOverview(db, overview("2026-06-01T10:15:00.000Z", { score: 35 }));
    insertSituationOverview(
      db,
      overview("2026-06-01T10:20:00.000Z", {
        timeframe: "4h",
        score: 10
      })
    );

    const latest = getLatestSituationOverview(db, {
      symbol: "BTCUSDT",
      timeframe: "1h"
    });
    assert.equal(latest?.score, 35);

    const history = listSituationOverviewHistory(db, {
      symbol: "BTCUSDT",
      timeframe: "1h",
      limit: 10
    });
    assert.equal(history.length, 2);
    assert.deepEqual(
      history.map((item) => item.generatedAt),
      ["2026-06-01T10:15:00.000Z", "2026-06-01T10:00:00.000Z"]
    );
  });
});
