import { appConfig } from "@/lib/config/appConfig";
import { closeDatabase, getDatabase } from "./client";
import { runMigrations } from "./migrations";
import { listActiveSymbols, seedSymbols } from "./repositories/symbolsRepository";

export function initializeDatabase() {
  const db = getDatabase();

  runMigrations(db);
  seedSymbols(db, appConfig.symbols);

  return {
    databasePath: appConfig.databasePath,
    activeSymbols: listActiveSymbols(db)
  };
}

if (process.argv[1]?.endsWith("initialize.ts")) {
  const result = initializeDatabase();

  console.log(
    JSON.stringify(
      {
        status: "ok",
        databasePath: result.databasePath,
        activeSymbols: result.activeSymbols.map((symbol) => symbol.symbol)
      },
      null,
      2
    )
  );

  closeDatabase();
}
