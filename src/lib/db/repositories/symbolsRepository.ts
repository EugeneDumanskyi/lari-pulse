import type Database from "better-sqlite3";
import type { AppSymbolConfig } from "@/lib/config/symbols";
import type { SymbolRecord } from "../types";

interface SymbolRow {
  id: number;
  symbol: string;
  asset_type: string;
  base_asset: string;
  quote_asset: string;
  source: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

function mapSymbol(row: SymbolRow): SymbolRecord {
  return {
    id: row.id,
    symbol: row.symbol,
    assetType: row.asset_type,
    baseAsset: row.base_asset,
    quoteAsset: row.quote_asset,
    source: row.source,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function seedSymbols(db: Database.Database, symbols: AppSymbolConfig[]) {
  const statement = db.prepare(`
    INSERT INTO symbols (
      symbol,
      asset_type,
      base_asset,
      quote_asset,
      source,
      is_active,
      updated_at
    )
    VALUES (
      @symbol,
      @assetType,
      @baseAsset,
      @quoteAsset,
      @source,
      @isActive,
      datetime('now')
    )
    ON CONFLICT(symbol) DO UPDATE SET
      asset_type = excluded.asset_type,
      base_asset = excluded.base_asset,
      quote_asset = excluded.quote_asset,
      source = excluded.source,
      is_active = excluded.is_active,
      updated_at = datetime('now')
  `);

  const insertMany = db.transaction((items: AppSymbolConfig[]) => {
    for (const symbol of items) {
      statement.run({
        ...symbol,
        isActive: symbol.isActive ? 1 : 0
      });
    }
  });

  insertMany(symbols);
}

export function listActiveSymbols(db: Database.Database): SymbolRecord[] {
  const rows = db
    .prepare(
      `
      SELECT *
      FROM symbols
      WHERE is_active = 1
      ORDER BY symbol ASC
    `
    )
    .all() as SymbolRow[];

  return rows.map(mapSymbol);
}
