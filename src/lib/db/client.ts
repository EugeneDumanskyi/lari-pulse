import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { appConfig } from "@/lib/config/appConfig";

let database: Database.Database | null = null;

export function getDatabase() {
  if (database) {
    return database;
  }

  fs.mkdirSync(path.dirname(appConfig.databasePath), { recursive: true });

  database = new Database(appConfig.databasePath);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");

  return database;
}

export function closeDatabase() {
  if (!database) {
    return;
  }

  database.close();
  database = null;
}
