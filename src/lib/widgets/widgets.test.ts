import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { runMigrations } from "@/lib/db/migrations";
import { getWidgetHistory } from "@/lib/db/repositories/widgetResultsRepository";
import { WidgetRegistry } from "./registry";
import {
  runWidgetRegistry,
  toNewWidgetResult,
  validateWidgetResult
} from "./runner";
import type { WidgetEngine } from "./types";

const placeholderWidget: WidgetEngine = {
  id: "placeholder_signal",
  name: "Placeholder Signal",
  description: "Development-only placeholder used to validate the widget runner.",
  requiredInputs: ["candles"],
  async run(context) {
    return {
      widgetId: "placeholder_signal",
      symbol: context.symbol,
      timeframe: context.timeframe,
      score: 50,
      direction: "neutral",
      confidence: 0.5,
      severity: "low",
      summary: "Placeholder widget result for runner validation.",
      details: {
        candleCount: context.candles?.length ?? 0
      },
      sources: [
        {
          source: "test",
          type: "placeholder",
          symbol: context.symbol,
          timeframe: context.timeframe,
          updatedAt: context.now.toISOString()
        }
      ],
      updatedAt: context.now.toISOString()
    };
  }
};

test("validateWidgetResult accepts a complete widget result", async () => {
  const result = await placeholderWidget.run({
    symbol: "BTCUSDT",
    timeframe: "1h",
    now: new Date("2026-05-22T00:00:00.000Z")
  });

  assert.doesNotThrow(() => validateWidgetResult(result));
  assert.equal(toNewWidgetResult(result).detailsJson, '{"candleCount":0}');
});

test("runWidgetRegistry runs a placeholder widget and saves validated output", async () => {
  const db = new Database(":memory:");
  runMigrations(db);

  try {
    const registry = new WidgetRegistry([placeholderWidget]);
    const outcomes = await runWidgetRegistry(
      registry,
      {
        symbol: "BTCUSDT",
        timeframe: "1h",
        now: new Date("2026-05-22T00:00:00.000Z")
      },
      {
        db,
        save: true
      }
    );

    assert.equal(outcomes.length, 1);
    const outcome = outcomes[0];
    assert.equal(outcome.status, "success");

    assert.equal(outcome.savedRowId, 1);

    const history = getWidgetHistory(db, {
      symbol: "BTCUSDT",
      timeframe: "1h",
      widgetId: "placeholder_signal"
    });

    assert.equal(history.length, 1);
    assert.equal(history[0].direction, "neutral");
    assert.equal(history[0].detailsJson, '{"candleCount":0}');
  } finally {
    db.close();
  }
});

test("runWidgetRegistry reports invalid widget output without saving it", async () => {
  const db = new Database(":memory:");
  runMigrations(db);

  const invalidWidget: WidgetEngine = {
    ...placeholderWidget,
    id: "invalid_placeholder",
    async run(context) {
      const result = await placeholderWidget.run(context);

      return {
        ...result,
        widgetId: "invalid_placeholder",
        score: 120
      };
    }
  };

  try {
    const registry = new WidgetRegistry([invalidWidget]);
    const outcomes = await runWidgetRegistry(
      registry,
      {
        symbol: "BTCUSDT",
        timeframe: "1h",
        now: new Date("2026-05-22T00:00:00.000Z")
      },
      {
        db,
        save: true
      }
    );

    assert.equal(outcomes[0].status, "failure");
    assert.match(outcomes[0].status === "failure" ? outcomes[0].error : "", /score/);

    const history = getWidgetHistory(db, {
      symbol: "BTCUSDT",
      timeframe: "1h",
      widgetId: "invalid_placeholder"
    });

    assert.equal(history.length, 0);
  } finally {
    db.close();
  }
});
