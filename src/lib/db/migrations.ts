import type Database from "better-sqlite3";
import { schemaSql } from "./schema";

export function runMigrations(db: Database.Database) {
  db.exec(schemaSql);
}
