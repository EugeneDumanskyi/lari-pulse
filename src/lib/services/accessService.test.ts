import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createAdminSession,
  filterVisibleWidgets,
  getSessionFromToken
} from "@/lib/auth/access";

describe("local access service", () => {
  it("defaults anonymous users to Basic access", () => {
    const session = getSessionFromToken(undefined);

    assert.equal(session.isAdmin, false);
    assert.equal(session.plan, "basic");
    assert.equal(session.role, "anonymous");
    assert.equal(session.userId, null);
    assert.deepEqual(session.accessibleSymbols, ["BTCUSDT"]);
    assert.ok(session.lockedSymbols.includes("ETHUSDT"));
    assert.ok(session.lockedSymbols.includes("SOLUSDT"));
    assert.ok(session.lockedSymbols.includes("NASDAQ100"));
    assert.deepEqual(session.visibleWidgetIds, ["trend_strength", "momentum_exhaustion"]);
  });

  it("allows Enterprise users to see all current widget groups and markets", () => {
    const session = createAdminSession();
    const visible = filterVisibleWidgets(
      [
        { widgetId: "trend_strength" },
        { widgetId: "risk_regime" },
        { widgetId: "unknown_future_widget" }
      ],
      session
    );

    assert.equal(session.isAdmin, true);
    assert.equal(session.plan, "enterprise");
    assert.ok(session.accessibleSymbols.includes("ETHUSDT"));
    assert.ok(session.accessibleSymbols.includes("NASDAQ100"));
    assert.ok(session.accessibleSymbols.includes("US10Y"));
    assert.deepEqual(visible.map((item) => item.widgetId), ["trend_strength", "risk_regime"]);
  });
});
