import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { createAdminSession, getSessionFromToken } from "@/lib/auth/access";
import { runMigrations } from "@/lib/db/migrations";
import { ApiInputError } from "./apiValidation";
import {
  getEffectiveVisibleWidgetIds,
  getWidgetSettingsState,
  updateWidgetSettings
} from "./widgetSettingsService";

function createMemoryDatabase() {
  const db = new Database(":memory:");
  runMigrations(db);
  return db;
}

describe("widget settings service", () => {
  it("returns fixed Basic widget visibility for anonymous users", () => {
    const db = createMemoryDatabase();
    const state = getWidgetSettingsState(getSessionFromToken(undefined), db);

    assert.equal(state.canEdit, false);
    assert.equal(state.plan, "basic");
    assert.deepEqual(state.enabledWidgetIds, ["trend_strength", "momentum_exhaustion"]);
    assert.equal(state.catalog.find((item) => item.widgetId === "trend_strength")?.isEnabled, true);
    assert.equal(state.catalog.find((item) => item.widgetId === "multi_timeframe_alignment")?.isLocked, true);
    assert.equal(state.catalog.find((item) => item.widgetId === "risk_regime")?.isLocked, true);
  });

  it("persists admin widget visibility and preserves catalog priority", () => {
    const db = createMemoryDatabase();
    const session = createAdminSession();

    updateWidgetSettings(
      {
        enabledWidgetIds: ["momentum_exhaustion", "risk_regime", "trend_strength"]
      },
      session,
      db
    );

    assert.deepEqual(getEffectiveVisibleWidgetIds(session, db), [
      "trend_strength",
      "momentum_exhaustion",
      "risk_regime"
    ]);

    const state = getWidgetSettingsState(session, db);

    assert.equal(state.canEdit, true);
    assert.equal(state.catalog.find((item) => item.widgetId === "volume_confirmation")?.isEnabled, false);
    assert.equal(state.catalog.find((item) => item.widgetId === "risk_regime")?.isEnabled, true);
  });

  it("rejects non-admin and unknown widget settings writes", () => {
    const db = createMemoryDatabase();

    assert.throws(
      () => updateWidgetSettings({ enabledWidgetIds: ["trend_strength"] }, getSessionFromToken(undefined), db),
      ApiInputError
    );
    assert.throws(
      () => updateWidgetSettings({ enabledWidgetIds: ["not_a_widget"] }, createAdminSession(), db),
      ApiInputError
    );
  });
});
