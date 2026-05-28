import assert from "node:assert/strict";
import test from "node:test";
import { validateWidgetResult } from "./runner";
import { liquidityWidgets, liquidationsWidget } from "./liquidity";
import { defaultVisibleWidgetIdsForPlan, widgetCatalog } from "./catalog";
import type { WidgetLiquidationSummary } from "./types";

const now = new Date("2026-05-26T10:00:00.000Z");

const liquidationSummary: WidgetLiquidationSummary = {
  symbol: "BTCUSDT",
  source: "binance_futures",
  timeframe: "1h",
  fromTime: Date.parse("2026-05-26T09:00:00.000Z"),
  toTime: Date.parse("2026-05-26T10:00:00.000Z"),
  longCount: 8,
  shortCount: 21,
  longNotionalUsd: 1_600_000,
  shortNotionalUsd: 6_200_000,
  totalNotionalUsd: 7_800_000,
  longLiquidatedUsd: 1_600_000,
  shortLiquidatedUsd: 6_200_000,
  totalLiquidatedUsd: 7_800_000,
  longShortImbalance: (1_600_000 - 6_200_000) / 7_800_000,
  eventCount: 29,
  largestLiquidation: {
    id: 1,
    eventId: "largest",
    symbol: "BTCUSDT",
    side: "short_liquidated",
    price: 100_000,
    quantity: 31,
    notionalUsd: 3_100_000,
    timestamp: Date.parse("2026-05-26T09:42:00.000Z"),
    source: "binance_futures"
  },
  topSymbolsByLiquidation: [
    {
      symbol: "BTCUSDT",
      totalLiquidatedUsd: 7_800_000,
      longLiquidatedUsd: 1_600_000,
      shortLiquidatedUsd: 6_200_000,
      eventCount: 29
    }
  ],
  timeline: [
    {
      fromTime: Date.parse("2026-05-26T09:00:00.000Z"),
      toTime: Date.parse("2026-05-26T10:00:00.000Z"),
      longLiquidatedUsd: 1_600_000,
      shortLiquidatedUsd: 6_200_000,
      totalLiquidatedUsd: 7_800_000,
      eventCount: 29
    }
  ],
  longShare: 8 / 29,
  shortShare: 21 / 29,
  netPressure: "short_liquidations",
  collector: {
    started: true,
    connected: true,
    reconnecting: false,
    lastError: null,
    messagesReceived: 29,
    eventsReceived: 29,
    eventsStored: 29,
    sourceRunId: 1
  }
};

test("liquidityWidgets expose stable ids", () => {
  assert.deepEqual(
    liquidityWidgets.map((widget) => widget.id),
    ["liquidations"]
  );
});

test("liquidationsWidget produces an explainable observed-flow result", async () => {
  const result = await liquidationsWidget.run({
    symbol: "BTCUSDT",
    timeframe: "1h",
    marketContext: {
      liquidity: {
        liquidationSummaries: {
          BTCUSDT: {
            "1h": liquidationSummary
          }
        }
      }
    },
    now
  });

  validateWidgetResult(result);
  assert.equal(result.direction, "short_liquidations_dominant");
  assert.equal(result.sources[0].source, "binance_futures");
  assert.equal(result.details.shortLiquidationUsd, 6_200_000);
  assert.equal((result.details.largestLiquidation as { side: string }).side, "short_liquidated");
  assert.match(result.details.limitation as string, /live-only/);
});

test("liquidationsWidget explains empty local history as collecting from now", async () => {
  const result = await liquidationsWidget.run({
    symbol: "BTCUSDT",
    timeframe: "1h",
    marketContext: {
      liquidity: {
        liquidationSummaries: {
          BTCUSDT: {
            "1h": {
              ...liquidationSummary,
              longCount: 0,
              shortCount: 0,
              longNotionalUsd: 0,
              shortNotionalUsd: 0,
              totalNotionalUsd: 0,
              longLiquidatedUsd: 0,
              shortLiquidatedUsd: 0,
              totalLiquidatedUsd: 0,
              longShortImbalance: 0,
              eventCount: 0,
              largestLiquidation: null,
              topSymbolsByLiquidation: [],
              timeline: [],
              longShare: 0,
              shortShare: 0,
              netPressure: "balanced"
            }
          }
        }
      }
    },
    now
  });

  validateWidgetResult(result);
  assert.equal(result.direction, "collecting_from_now");
  assert.match(result.summary, /collecting from now/);
});

test("catalog includes liquidity widgets as Enterprise crypto widgets in priority order", () => {
  const cryptoIds = widgetCatalog
    .filter((item) => item.group === "crypto")
    .sort((left, right) => left.priority - right.priority)
    .map((item) => item.widgetId);

  assert.deepEqual(cryptoIds, [
    "trend_strength",
    "liquidations",
    "multi_timeframe_alignment",
    "momentum_exhaustion",
    "support_resistance_pressure",
    "volume_confirmation"
  ]);
  assert.equal(widgetCatalog.find((item) => item.widgetId === "liquidations")?.planTier, "enterprise");
  assert.deepEqual(defaultVisibleWidgetIdsForPlan("basic"), ["trend_strength", "momentum_exhaustion"]);
});
