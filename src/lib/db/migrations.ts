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

function runBackwardCompatibleSchemaUpdates(db: Database.Database) {
  for (const column of symbolColumns) {
    if (!columnExists(db, "symbols", column.name)) {
      db.prepare(`ALTER TABLE symbols ADD COLUMN ${column.name} ${column.definition}`).run();
    }
  }
}

export function runMigrations(db: Database.Database) {
  db.exec(schemaSql);
  runBackwardCompatibleSchemaUpdates(db);
}
