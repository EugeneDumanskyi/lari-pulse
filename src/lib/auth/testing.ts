import Database from "better-sqlite3";
import { runMigrations } from "@/lib/db/migrations";
import { createSession, createUser } from "@/lib/db/repositories/accountRepository";
import type { UserRole } from "@/lib/db/types";
import { getSessionFromToken } from "./access";

/** Test helpers: an in-memory database and real sessions for each role. */

export function createTestDatabase() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

export function createTestSession(db: Database.Database, role: UserRole, email = `${role}@example.com`) {
  const user = createUser(db, {
    email,
    // Not a valid scrypt hash: these accounts cannot sign in with a password.
    passwordHash: "test:not-a-password",
    role,
    status: "active"
  });
  const { token } = createSession(db, { userId: user.id, maxAgeSeconds: 3600 });

  return getSessionFromToken(token, db);
}

export function anonymousTestSession(db: Database.Database) {
  return getSessionFromToken(undefined, db);
}
