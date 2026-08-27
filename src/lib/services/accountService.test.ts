import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AccessError, authenticateAccount } from "@/lib/auth/access";
import { createTestDatabase, createTestSession } from "@/lib/auth/testing";
import { countUsers, createInvite } from "@/lib/db/repositories/accountRepository";
import { ApiInputError } from "./apiValidation";
import {
  changeOwnPassword,
  completeFirstRunSetup,
  createInviteForAdmin,
  deleteUserForAdmin,
  getInstanceStatus,
  listInvitesForAdmin,
  resetPasswordByEmail,
  signUp,
  updateInstanceSettingsForAdmin,
  updateUserForAdmin
} from "./accountService";

function statusOf(action: () => unknown) {
  try {
    action();
    return 200;
  } catch (error) {
    assert.ok(error instanceof ApiInputError || error instanceof AccessError, String(error));
    return error.statusCode;
  }
}

const credentials = { email: "new@example.com", password: "long-enough-password" };

describe("first-run setup", () => {
  it("creates the first admin once, then refuses", () => {
    const db = createTestDatabase();

    assert.equal(getInstanceStatus(db).needsSetup, true);
    const admin = completeFirstRunSetup({ email: "Owner@Example.com", password: "long-enough-password" }, db);

    assert.equal(admin.role, "admin");
    assert.equal(admin.email, "owner@example.com");
    assert.equal(getInstanceStatus(db).needsSetup, false);
    assert.equal(statusOf(() => completeFirstRunSetup(credentials, db)), 409);
    assert.equal(countUsers(db), 1);
  });

  it("validates email and password", () => {
    const db = createTestDatabase();

    assert.equal(statusOf(() => completeFirstRunSetup({ email: "not-an-email", password: "long-enough-password" }, db)), 400);
    assert.equal(statusOf(() => completeFirstRunSetup({ email: "a@example.com", password: "short" }, db)), 400);
    assert.equal(countUsers(db), 0);
  });
});

describe("sign-up modes and invites", () => {
  it("rejects sign-up while closed and before setup", () => {
    const db = createTestDatabase();

    assert.equal(statusOf(() => signUp(credentials, db)), 409);
    createTestSession(db, "admin");
    assert.equal(getInstanceStatus(db).signupMode, "closed");
    assert.equal(statusOf(() => signUp(credentials, db)), 403);
  });

  it("creates viewers when sign-up is open", () => {
    const db = createTestDatabase();
    const admin = createTestSession(db, "admin");

    updateInstanceSettingsForAdmin(admin, { signupMode: "open" }, db);
    const user = signUp(credentials, db);

    assert.equal(user.role, "viewer");
    assert.equal(statusOf(() => signUp(credentials, db)), 409);
  });

  it("uses the invite role, allows one use and binds to an email when given", () => {
    const db = createTestDatabase();
    const admin = createTestSession(db, "admin");
    const open = createInviteForAdmin(admin, { role: "analyst" }, db);
    const bound = createInviteForAdmin(admin, { role: "viewer", email: "Bound@Example.com" }, db);

    assert.match(open.path, /^\/signup\?invite=/);
    assert.equal(listInvitesForAdmin(admin, db).length, 2);

    const analyst = signUp({ ...credentials, inviteToken: open.token }, db);
    assert.equal(analyst.role, "analyst");
    assert.equal(statusOf(() => signUp({ email: "again@example.com", password: "long-enough-password", inviteToken: open.token }, db)), 403);

    assert.equal(statusOf(() => signUp({ email: "other@example.com", password: "long-enough-password", inviteToken: bound.token }, db)), 403);
    assert.equal(signUp({ email: "bound@example.com", password: "long-enough-password", inviteToken: bound.token }, db).role, "viewer");
    assert.equal(listInvitesForAdmin(admin, db).length, 0);
  });

  it("rejects expired and unknown invites", () => {
    const db = createTestDatabase();
    const admin = createTestSession(db, "admin");
    const expired = createInvite(db, { role: "analyst", createdBy: admin.userId, maxAgeSeconds: -1 });

    assert.equal(statusOf(() => signUp({ ...credentials, inviteToken: expired.token }, db)), 403);
    assert.equal(statusOf(() => signUp({ ...credentials, inviteToken: "made-up" }, db)), 403);
  });

  it("lets only admins manage invites and instance settings", () => {
    const db = createTestDatabase();
    const analyst = createTestSession(db, "analyst");

    assert.equal(statusOf(() => createInviteForAdmin(analyst, { role: "viewer" }, db)), 403);
    assert.equal(statusOf(() => updateInstanceSettingsForAdmin(analyst, { publicDashboard: true }, db)), 403);
  });
});

describe("user management", () => {
  it("keeps at least one active admin", () => {
    const db = createTestDatabase();
    const admin = createTestSession(db, "admin");
    const viewer = createTestSession(db, "viewer");

    assert.equal(statusOf(() => updateUserForAdmin(admin, admin.userId!, { role: "viewer" }, db)), 409);
    assert.equal(statusOf(() => updateUserForAdmin(admin, admin.userId!, { status: "disabled" }, db)), 409);
    assert.equal(statusOf(() => deleteUserForAdmin(admin, admin.userId!, db)), 409);

    assert.equal(updateUserForAdmin(admin, viewer.userId!, { role: "admin" }, db).role, "admin");
    assert.equal(updateUserForAdmin(admin, admin.userId!, { role: "analyst" }, db).role, "analyst");
  });

  it("rejects unknown roles and non-admin callers", () => {
    const db = createTestDatabase();
    const admin = createTestSession(db, "admin");
    const viewer = createTestSession(db, "viewer");

    assert.equal(statusOf(() => updateUserForAdmin(admin, viewer.userId!, { role: "owner" }, db)), 400);
    assert.equal(statusOf(() => updateUserForAdmin(viewer, admin.userId!, { role: "viewer" }, db)), 403);
  });
});

describe("passwords", () => {
  it("changes the own password after checking the current one", () => {
    const db = createTestDatabase();
    completeFirstRunSetup({ email: "owner@example.com", password: "first-password" }, db);
    const session = createTestSession(db, "viewer", "viewer@example.com");
    resetPasswordByEmail("viewer@example.com", "viewer-password", db);

    assert.equal(statusOf(() => changeOwnPassword(session, { currentPassword: "wrong", newPassword: "next-password" }, db)), 400);
    changeOwnPassword(session, { currentPassword: "viewer-password", newPassword: "next-password" }, db);

    assert.equal(authenticateAccount({ email: "viewer@example.com", password: "viewer-password" }, db), null);
    assert.equal(authenticateAccount({ email: "viewer@example.com", password: "next-password" }, db)?.role, "viewer");
  });

  it("resets a password from the CLI and re-enables the account", () => {
    const db = createTestDatabase();
    const admin = completeFirstRunSetup({ email: "owner@example.com", password: "first-password" }, db);
    db.prepare("UPDATE users SET status = 'disabled' WHERE id = ?").run(admin.id);

    const reset = resetPasswordByEmail("OWNER@example.com", "recovered-password", db);

    assert.equal(reset.status, "active");
    assert.equal(authenticateAccount({ email: "owner@example.com", password: "recovered-password" }, db)?.id, admin.id);
    assert.equal(statusOf(() => resetPasswordByEmail("missing@example.com", "recovered-password", db)), 404);
  });
});
