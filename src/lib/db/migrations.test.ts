import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { IncompatibleDatabaseError, runMigrations } from "./migrations";

describe("migrations", () => {
  it("creates the schema and can run repeatedly", () => {
    const db = new Database(":memory:");

    runMigrations(db);
    runMigrations(db);

    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>)
      .map((row) => row.name);
    assert.ok(tables.includes("invites"));
    assert.ok(tables.includes("app_settings"));
  });

  it("refuses databases created with plan-based access", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE alert_rules (id INTEGER PRIMARY KEY, access_plan TEXT NOT NULL);
    `);

    assert.throws(() => runMigrations(db), IncompatibleDatabaseError);
  });

  it("refuses databases with the old user roles", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, role TEXT NOT NULL CHECK (role IN ('user', 'admin')));
    `);

    assert.throws(() => runMigrations(db), /npm run db:init/);
  });
});
