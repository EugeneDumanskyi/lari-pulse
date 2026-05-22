import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { runMigrations } from "@/lib/db/migrations";
import { getLatestWidgetResults } from "@/lib/db/repositories/widgetResultsRepository";
import type { CandleRecord } from "@/lib/db/types";
import { WidgetRegistry } from "../registry";
import { runWidgetRegistry } from "../runner";
import { validateWidgetResult } from "../runner";
import { phase1Widgets } from ".";

function makeCandles(symbol: string, timeframe: string, count = 90, start = 100): CandleRecord[] {
  return Array.from({ length: count }, (_, index) => {
    const drift = index * 0.65;
    const wave = Math.sin(index / 4) * 1.8;
    const close = start + drift + wave;
    const open = close - 0.45 + Math.sin(index / 3) * 0.25;
    const high = Math.max(open, close) + 1.2 + (index % 5) * 0.1;
    const low = Math.min(open, close) - 1.1 - (index % 4) * 0.1;

    return {
      id: index + 1,
      symbol,
      timeframe,
      openTime: Date.UTC(2026, 4, 20, 0, 0, 0) + index * 60_000,
      closeTime: Date.UTC(2026, 4, 20, 0, 0, 0) + index * 60_000 + 59_999,
      open,
      high,
      low,
      close,
      volume: 1000 + index * 12 + (index % 6) * 30,
      source: "binance",
      createdAt: "2026-05-22T00:00:00.000Z"
    };
  });
}

test("phase1Widgets are registered with stable ids", () => {
  assert.deepEqual(
    phase1Widgets.map((widget) => widget.id),
    [
      "trend_strength",
      "momentum_exhaustion",
      "support_resistance_pressure",
      "volume_confirmation",
      "multi_timeframe_alignment"
    ]
  );
});

test("phase1Widgets produce valid results and save to SQLite", async () => {
  const db = new Database(":memory:");
  runMigrations(db);

  try {
    const symbol = "SOLUSDT";
    const timeframeCandles = {
      "15m": makeCandles(symbol, "15m", 90, 90),
      "1h": makeCandles(symbol, "1h", 90, 100),
      "4h": makeCandles(symbol, "4h", 90, 110),
      "1d": makeCandles(symbol, "1d", 90, 120)
    };
    const registry = new WidgetRegistry(phase1Widgets);
    const outcomes = await runWidgetRegistry(
      registry,
      {
        symbol,
        timeframe: "1h",
        candles: timeframeCandles["1h"],
        marketContext: {
          timeframeCandles
        },
        now: new Date("2026-05-22T00:00:00.000Z")
      },
      {
        db,
        save: true
      }
    );

    assert.equal(outcomes.length, 5);

    for (const outcome of outcomes) {
      assert.equal(outcome.status, "success");

      if (outcome.status === "success") {
        validateWidgetResult(outcome.result);
        assert.ok(outcome.savedRowId);
      }
    }

    const latest = getLatestWidgetResults(db, {
      symbol,
      timeframe: "1h"
    });

    assert.equal(latest.length, 5);
  } finally {
    db.close();
  }
});
