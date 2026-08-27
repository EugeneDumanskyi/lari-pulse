import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { appConfig } from "@/lib/config/appConfig";
import { runMigrations } from "@/lib/db/migrations";
import {
  createSession,
  createUser,
  deleteExpiredSessions,
  deleteSessionByToken,
  findUserByEmail,
  getSessionContextByToken,
  seedAdminUser
} from "./accountRepository";

function memoryDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

describe("account repository", () => {
  it("creates users and session contexts", () => {
    const db = memoryDb();
    const user = createUser(db, {
      email: "User@Example.com",
      passwordHash: hashPassword("password123"),
      role: "viewer",
      status: "active"
    });
    const session = createSession(db, { userId: user.id, maxAgeSeconds: 3600 });
    const context = getSessionContextByToken(db, session.token);

    assert.equal(user.email, "user@example.com");
    assert.equal(context?.user.id, user.id);
    assert.notEqual(context?.session.tokenHash, session.token);
    assert.equal(verifyPassword("password123", user.passwordHash), true);
    assert.equal(verifyPassword("wrong-password", user.passwordHash), false);

    deleteSessionByToken(db, session.token);
    assert.equal(getSessionContextByToken(db, session.token), null);
  });

  it("ignores expired sessions", () => {
    const db = memoryDb();
    const user = createUser(db, {
      email: "expired@example.com",
      passwordHash: hashPassword("password123"),
      role: "viewer",
      status: "active"
    });
    const session = createSession(db, { userId: user.id, maxAgeSeconds: -60 });

    assert.equal(getSessionContextByToken(db, session.token), null);
    deleteExpiredSessions(db);
    assert.equal((db.prepare("SELECT COUNT(*) AS count FROM sessions").get() as { count: number }).count, 0);
  });

  it("seeds the env admin only when both variables are set and no users exist", () => {
    const db = memoryDb();
    const original = { email: appConfig.adminEmail, password: appConfig.adminPassword };

    try {
      appConfig.adminEmail = null;
      appConfig.adminPassword = null;
      assert.equal(seedAdminUser(db), null);

      appConfig.adminEmail = "Ops@Example.com";
      appConfig.adminPassword = "seeded-password";
      const admin = seedAdminUser(db);

      assert.equal(admin?.role, "admin");
      assert.equal(admin?.email, "ops@example.com");
      assert.equal(seedAdminUser(db), null);
      assert.equal(findUserByEmail(db, "ops@example.com")?.id, admin?.id);
    } finally {
      appConfig.adminEmail = original.email;
      appConfig.adminPassword = original.password;
    }
  });
});
