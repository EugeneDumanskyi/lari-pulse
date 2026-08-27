import type Database from "better-sqlite3";
import type { SymbolApi } from "@/lib/api/types";
import { getDatabase } from "@/lib/db/client";
import { initializeDatabase } from "@/lib/db/initialize";
import { listActiveSymbols } from "@/lib/db/repositories/symbolsRepository";

export function listSymbols(db?: Database.Database): SymbolApi[] {
  const database = db ?? getDatabase();

  if (!db) {
    initializeDatabase();
  }

  return listActiveSymbols(database).map((symbol) => ({
    symbol: symbol.symbol,
    assetType: symbol.assetType,
    baseAsset: symbol.baseAsset,
    quoteAsset: symbol.quoteAsset,
    source: symbol.source,
    displayName: symbol.displayName,
    providerSymbol: symbol.providerSymbol,
    priceUnit: symbol.priceUnit,
    isActive: symbol.isActive
  }));
}
