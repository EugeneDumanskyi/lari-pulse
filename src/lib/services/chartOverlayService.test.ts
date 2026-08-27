import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { createTestSession } from "@/lib/auth/testing";
import { runMigrations } from "@/lib/db/migrations";
import { insertLiquidationEvents } from "@/lib/db/repositories/liquidityRepository";
import { insertSituationOverview } from "@/lib/db/repositories/situationOverviewRepository";
import { insertWidgetResult } from "@/lib/db/repositories/widgetResultsRepository";
import { getChartOverlays } from "./chartOverlayService";

function makeDb() {
  const db = new Database(":memory:");
  runMigrations(db);
  return db;
}

function insertResult(
  db: Database.Database,
  widgetId: string,
  details: Record<string, unknown>,
  createdAt = "2026-06-01T00:00:00.000Z"
) {
  insertWidgetResult(db, {
    widgetId,
    symbol: "BTCUSDT",
    timeframe: "1h",
    score: 62,
    direction: "test",
    confidence: 0.7,
    severity: "medium",
    summary: "Test result",
    detailsJson: JSON.stringify(details),
    sourcesJson: JSON.stringify([]),
    createdAt
  });
}

describe("chart overlay service", () => {
  it("extracts support/resistance and liquidation overlays from latest widget details", async () => {
    const db = makeDb();
    const session = createTestSession(db, "viewer");

    insertResult(db, "support_resistance_pressure", {
      currentPrice: 100_000,
      nearestSupport: { price: 98_500, touches: 3, distancePct: -1.5 },
      nearestResistance: { price: 102_000, touches: 2, distancePct: 2 }
    });
    insertLiquidationEvents(db, [
      {
        eventId: "overlay-test-long",
        symbol: "BTCUSDT",
        source: "binance_futures",
        eventTime: Date.now() - 5 * 60 * 1000,
        side: "long_liquidated",
        orderSide: "SELL",
        price: 99_200,
        quantity: 12,
        notionalUsd: 1_190_400,
        metadataJson: null
      }
    ]);

    const response = await getChartOverlays({ symbol: "BTCUSDT", timeframe: "1h", session }, db);
    const labels = response.overlays.map((overlay) => overlay.label);

    assert.equal(response.symbol, "BTCUSDT");
    assert.ok(labels.includes("Support zone"));
    assert.ok(labels.includes("Resistance zone"));
    assert.ok(labels.includes("Largest liquidation"));
    assert.ok(response.overlays.every((overlay) => overlay.reason.length > 0));
  });

  it("extracts priced Situation Overview watch conditions when history exists", async () => {
    const db = makeDb();
    const session = createTestSession(db, "viewer");

    insertSituationOverview(db, {
      symbol: "BTCUSDT",
      timeframe: "1h",
      generatedAt: "2026-06-01T00:05:00.000Z",
      title: "BTC test",
      summary: "Test summary",
      bias: "bullish",
      riskLevel: "moderate",
      confidence: "medium",
      score: 64,
      riskScore: 42,
      mainDriversJson: "[]",
      conflictingSignalsJson: "[]",
      watchConditionsJson: JSON.stringify([
        {
          id: "watch-resistance-reclaim",
          label: "Resistance pressure",
          condition: "BTCUSDT holds above 104,200 with improving confirmation",
          implication: "Bearish or range pressure would weaken if the move is confirmed by volume and trend widgets.",
          severity: "warning",
          sourceWidget: "support_resistance_pressure"
        }
      ]),
      dataWarningsJson: "[]",
      changesJson: "[]",
      sourceWidgetsJson: "[]",
      metaJson: "{}"
    });

    const response = await getChartOverlays({ symbol: "BTCUSDT", timeframe: "1h", session }, db);
    const watchOverlay = response.overlays.find((overlay) => overlay.id.includes("watch-resistance-reclaim"));

    assert.equal(watchOverlay?.price, 104_200);
    assert.equal(watchOverlay?.severity, "medium");
    assert.equal(watchOverlay?.sourceWidget, "support_resistance_pressure");
  });
});
