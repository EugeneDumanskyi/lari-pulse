import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AccessError } from "@/lib/auth/access";
import { anonymousTestSession, createTestDatabase, createTestSession } from "@/lib/auth/testing";
import { widgetCatalog } from "@/lib/widgets/catalog";
import { ApiInputError } from "./apiValidation";
import {
  getEffectiveVisibleWidgetIds,
  getWidgetSettingsState,
  updateWidgetSettings
} from "./widgetSettingsService";

describe("widget settings service", () => {
  it("defaults every catalog widget to its catalog setting", () => {
    const db = createTestDatabase();
    const state = getWidgetSettingsState(createTestSession(db, "viewer"), db);

    assert.equal(state.canEdit, false);
    assert.equal(state.enabledWidgetIds.length, widgetCatalog.filter((item) => item.defaultEnabled).length);
    assert.equal(state.catalog.find((item) => item.widgetId === "risk_regime")?.isEnabled, true);
  });

  it("persists admin widget visibility instance-wide in catalog priority order", () => {
    const db = createTestDatabase();
    const admin = createTestSession(db, "admin");

    updateWidgetSettings(
      {
        enabledWidgetIds: ["momentum_exhaustion", "risk_regime", "trend_strength"]
      },
      admin,
      db
    );

    assert.deepEqual(getEffectiveVisibleWidgetIds(db), [
      "trend_strength",
      "momentum_exhaustion",
      "risk_regime"
    ]);
    assert.deepEqual(createTestSession(db, "viewer").visibleWidgetIds, getEffectiveVisibleWidgetIds(db));

    const state = getWidgetSettingsState(admin, db);

    assert.equal(state.canEdit, true);
    assert.equal(state.catalog.find((item) => item.widgetId === "volume_confirmation")?.isEnabled, false);
    assert.equal(state.catalog.find((item) => item.widgetId === "risk_regime")?.isEnabled, true);
  });

  it("rejects non-admin, anonymous and unknown widget settings writes", () => {
    const db = createTestDatabase();

    assert.throws(
      () => updateWidgetSettings({ enabledWidgetIds: ["trend_strength"] }, createTestSession(db, "analyst"), db),
      AccessError
    );
    assert.throws(() => getWidgetSettingsState(anonymousTestSession(db), db), AccessError);
    assert.throws(
      () => updateWidgetSettings({ enabledWidgetIds: ["not_a_widget"] }, createTestSession(db, "admin"), db),
      ApiInputError
    );
  });
});
