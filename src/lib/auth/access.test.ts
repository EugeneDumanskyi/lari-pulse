import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSession, createUser, updateUser } from "@/lib/db/repositories/accountRepository";
import { updateAppSettings } from "@/lib/db/repositories/appSettingsRepository";
import { upsertWidgetSettings } from "@/lib/db/repositories/widgetSettingsRepository";
import { ApiInputError, validateSymbolAccess } from "@/lib/services/apiValidation";
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

  it("guards user-owned rows with requireUser, where requireRole alone would pass", () => {
    const db = createTestDatabase();
    const anonymous = anonymousTestSession(db);
    const viewer = createTestSession(db, "viewer");

    // Anonymous with no public dashboard: 401 before the role is even ranked.
    assert.equal(statusOf(() => requireUser(anonymous, "viewer")), 401);

    updateAppSettings(db, { publicDashboard: true });
    const publicViewer = anonymousTestSession(db);

    assert.equal(publicViewer.userId, null);
    assert.equal(statusOf(() => requireRole(publicViewer, "viewer")), 200);
    assert.equal(statusOf(() => requireUser(publicViewer, "viewer")), 401);

    // A signed-in viewer owns rows at viewer, but is still below analyst.
    assert.equal(requireUser(viewer, "viewer").userId, viewer.userId);
    assert.equal(statusOf(() => requireUser(viewer, "analyst")), 403);
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

describe("scan access", () => {
  function scanStatus(action: () => unknown) {
    try {
      action();
      return 200;
    } catch (error) {
      if (error instanceof AccessError || error instanceof ApiInputError) {
        return error.statusCode;
      }

      throw error;
    }
  }

  it("refuses an anonymous visitor while the public dashboard is off", () => {
    const db = createTestDatabase();

    assert.equal(scanStatus(() => requireRole(anonymousTestSession(db), "viewer")), 401);
  });

  it("lets the public-dashboard anonymous viewer run a scan", () => {
    const db = createTestDatabase();
    updateAppSettings(db, { publicDashboard: true });
    const anonymous = anonymousTestSession(db);

    // A scan owns no rows, so `requireRole` is the right gate and this visitor
    // passes it where `requireUser` would not.
    assert.equal(anonymous.userId, null);
    assert.equal(scanStatus(() => requireRole(anonymous, "viewer")), 200);
  });

  it("rejects a requested symbol outside the session's accessible symbols", () => {
    const db = createTestDatabase();
    const viewer = createTestSession(db, "viewer");
    const narrowed = { ...viewer, accessibleSymbols: ["BTCUSDT"] };

    assert.equal(scanStatus(() => validateSymbolAccess("BTCUSDT", narrowed)), 200);
    assert.equal(scanStatus(() => validateSymbolAccess("ETHUSDT", narrowed)), 400);
  });
});

describe("insights access", () => {
  it("refuses an anonymous visitor while the public dashboard is off", () => {
    const db = createTestDatabase();

    assert.equal(statusOf(() => requireRole(anonymousTestSession(db), "viewer")), 401);
  });

  it("refuses a signed-in session below viewer", () => {
    const db = createTestDatabase();
    const viewer = createTestSession(db, "viewer");
    // No role below viewer exists today; pinning the path makes adding one
    // fail loudly here instead of silently widening the page.
    const belowViewer = { ...viewer, role: null, isAuthenticated: true };

    assert.equal(statusOf(() => requireRole(belowViewer, "viewer")), 403);
  });

  it("lets the public-dashboard anonymous viewer read the market sections", () => {
    const db = createTestDatabase();
    updateAppSettings(db, { publicDashboard: true });
    const anonymous = anonymousTestSession(db);

    assert.equal(anonymous.userId, null);
    assert.equal(statusOf(() => requireRole(anonymous, "viewer")), 200);
  });

  it("keeps alert activity out of that session rather than failing the request", () => {
    const db = createTestDatabase();
    updateAppSettings(db, { publicDashboard: true });
    const anonymous = anonymousTestSession(db);

    // `requireUser` is what `alert-activity` would need, and this session
    // fails it, which is why the section is omitted and not a 403.
    assert.notEqual(statusOf(() => requireUser(anonymous, "analyst")), 200);
    assert.equal(hasRole(anonymous, "analyst"), false);
  });
});
