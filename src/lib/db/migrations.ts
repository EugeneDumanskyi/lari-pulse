import type Database from "better-sqlite3";
import { schemaSql } from "./schema";

const symbolColumns = [
  { name: "display_name", definition: "TEXT" },
  { name: "provider_symbol", definition: "TEXT" },
  { name: "price_unit", definition: "TEXT" },
  { name: "metadata_json", definition: "TEXT" }
] as const;

function columnExists(db: Database.Database, table: string, column: string) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

function tableExists(db: Database.Database, table: string) {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
  return Boolean(row);
}

function tableSql(db: Database.Database, table: string) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) as
    | { sql: string }
    | undefined;
  return row?.sql ?? "";
}

export class IncompatibleDatabaseError extends Error {
  constructor(databasePath?: string) {
    super(
      `The SQLite database${databasePath ? ` at ${databasePath}` : ""} was created by an older LariPulse version ` +
        "that used plan-based access. Stop the app, delete the database file (and its -wal/-shm files), " +
        "then run `npm run db:init`."
    );
    this.name = "IncompatibleDatabaseError";
  }
}

function assertCompatibleSchema(db: Database.Database) {
  const legacyPlanColumn = ["situation_overviews", "alert_rules", "alert_events"].some(
    (table) => tableExists(db, table) && columnExists(db, table, "access_plan")
  );
  const unownedPortfolio = tableExists(db, "portfolio_items") && !columnExists(db, "portfolio_items", "user_id");
  const legacyRoles = tableExists(db, "users") && tableSql(db, "users").includes("'user', 'admin'");

  if (legacyPlanColumn || unownedPortfolio || legacyRoles) {
    throw new IncompatibleDatabaseError(db.name);
  }
}

function runBackwardCompatibleSchemaUpdates(db: Database.Database) {
  for (const column of symbolColumns) {
    if (!columnExists(db, "symbols", column.name)) {
      db.prepare(`ALTER TABLE symbols ADD COLUMN ${column.name} ${column.definition}`).run();
    }
  }
}

export function runMigrations(db: Database.Database) {
  assertCompatibleSchema(db);
  db.exec(schemaSql);
  runBackwardCompatibleSchemaUpdates(db);
}
