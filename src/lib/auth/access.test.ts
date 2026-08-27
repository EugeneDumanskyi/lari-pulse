import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSession, createUser, updateUser } from "@/lib/db/repositories/accountRepository";
import { updateAppSettings } from "@/lib/db/repositories/appSettingsRepository";
import { upsertWidgetSettings } from "@/lib/db/repositories/widgetSettingsRepository";
import { AccessError, filterVisibleWidgets, getSessionFromToken, hasRole, requireRole, requireUser } from "./access";
import { LoginThrottle } from "./loginThrottle";
import { anonymousTestSession, createTestDatabase, createTestSession } from "./testing";

function statusOf(action: () => unknown) {
  try {
    action();
    return 200;
  } catch (error) {
    assert.ok(error instanceof AccessError);
    return error.statusCode;
  }
}

describe("role-based access", () => {
  it("ranks viewer < analyst < admin", () => {
    const db = createTestDatabase();
    const viewer = createTestSession(db, "viewer");
    const analyst = createTestSession(db, "analyst");
    const admin = createTestSession(db, "admin");

    assert.deepEqual(
      [viewer, analyst, admin].map((session) => [
        hasRole(session, "viewer"),
        hasRole(session, "analyst"),
        hasRole(session, "admin")
      ]),
      [
        [true, false, false],
        [true, true, false],
        [true, true, true]
      ]
    );
  });

  it("answers 401 for anonymous visitors and 403 for insufficient roles", () => {
    const db = createTestDatabase();
    const anonymous = anonymousTestSession(db);
    const viewer = createTestSession(db, "viewer");

    assert.equal(anonymous.role, null);
    assert.equal(statusOf(() => requireRole(anonymous, "viewer")), 401);
    assert.equal(statusOf(() => requireRole(viewer, "viewer")), 200);
    assert.equal(statusOf(() => requireRole(viewer, "analyst")), 403);
    assert.equal(statusOf(() => requireRole(viewer, "admin")), 403);
  });

  it("gives anonymous visitors read-only viewer access when the public dashboard is on", () => {
    const db = createTestDatabase();
    updateAppSettings(db, { publicDashboard: true });
    const anonymous = anonymousTestSession(db);

    assert.equal(anonymous.role, "viewer");
    assert.equal(anonymous.isAuthenticated, false);
    assert.equal(statusOf(() => requireRole(anonymous, "viewer")), 200);
    assert.equal(statusOf(() => requireRole(anonymous, "analyst")), 401);
    assert.equal(statusOf(() => requireUser(anonymous)), 401);
    assert.ok(anonymous.accessibleSymbols.includes("NASDAQ100"));
  });

  it("resolves the same instance-wide symbols and widgets for every role", () => {
    const db = createTestDatabase();
    upsertWidgetSettings(db, [{ widgetId: "volume_confirmation", isEnabled: false }]);
    const viewer = createTestSession(db, "viewer");
    const admin = createTestSession(db, "admin");

    assert.deepEqual(viewer.accessibleSymbols, admin.accessibleSymbols);
    assert.deepEqual(viewer.visibleWidgetIds, admin.visibleWidgetIds);
    assert.ok(viewer.accessibleSymbols.includes("ETHUSDT"));
    assert.ok(viewer.visibleWidgetIds.includes("risk_regime"));
    assert.equal(viewer.visibleWidgetIds.includes("volume_confirmation"), false);
    assert.deepEqual(
      filterVisibleWidgets(
        [{ widgetId: "risk_regime" }, { widgetId: "trend_strength" }, { widgetId: "unknown_future_widget" }],
        viewer
      ).map((item) => item.widgetId),
      ["trend_strength", "risk_regime"]
    );
  });

  it("ignores sessions that belong to a disabled user", () => {
    const db = createTestDatabase();
    const user = createUser(db, { email: "gone@example.com", passwordHash: "x", role: "analyst", status: "active" });
    const { token } = createSession(db, { userId: user.id, maxAgeSeconds: 3600 });

    assert.equal(getSessionFromToken(token, db).role, "analyst");
    updateUser(db, user.id, { status: "disabled" });
    assert.equal(getSessionFromToken(token, db).role, null);
  });
});

describe("login throttle", () => {
  it("blocks an account after repeated failures and resets on success", () => {
    const throttle = new LoginThrottle({ windowMs: 60_000, maxFailuresPerAccount: 3, maxFailuresPerIp: 10 });
    const now = 1_000_000;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      assert.equal(throttle.retryAfterSeconds("10.0.0.1", "a@example.com", now), 0);
      throttle.recordFailure("10.0.0.1", "a@example.com", now);
    }

    assert.equal(throttle.retryAfterSeconds("10.0.0.1", "A@example.com", now), 60);
    assert.equal(throttle.retryAfterSeconds("10.0.0.1", "b@example.com", now), 0);
    assert.equal(throttle.retryAfterSeconds("10.0.0.1", "a@example.com", now + 60_000), 0);

    throttle.recordSuccess("10.0.0.1", "a@example.com");
    assert.equal(throttle.retryAfterSeconds("10.0.0.1", "a@example.com", now), 0);
  });

  it("limits a single IP across many accounts", () => {
    const throttle = new LoginThrottle({ windowMs: 60_000, maxFailuresPerAccount: 100, maxFailuresPerIp: 4 });

    for (let attempt = 0; attempt < 4; attempt += 1) {
      throttle.recordFailure("10.0.0.2", `user${attempt}@example.com`, 0);
    }

    assert.ok(throttle.retryAfterSeconds("10.0.0.2", "new@example.com", 0) > 0);
    assert.equal(throttle.retryAfterSeconds("10.0.0.3", "new@example.com", 0), 0);
  });
});
