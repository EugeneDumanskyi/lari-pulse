import type Database from "better-sqlite3";
import type { AssetType, MarketDataSource } from "@/lib/config/marketTypes";
import type { AppSymbolConfig } from "@/lib/config/symbols";
import type { SymbolRecord } from "../types";

interface SymbolRow {
  id: number;
  symbol: string;
  asset_type: string;
  base_asset: string;
  quote_asset: string;
  source: string;
  display_name: string | null;
  provider_symbol: string | null;
  price_unit: string | null;
  metadata_json: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

function mapSymbol(row: SymbolRow): SymbolRecord {
  return {
    id: row.id,
    symbol: row.symbol,
    assetType: row.asset_type as AssetType,
    baseAsset: row.base_asset,
    quoteAsset: row.quote_asset,
    source: row.source as MarketDataSource,
    displayName: row.display_name,
    providerSymbol: row.provider_symbol,
    priceUnit: row.price_unit,
    metadataJson: row.metadata_json,
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
      display_name,
      provider_symbol,
      price_unit,
      metadata_json,
      is_active,
      updated_at
    )
    VALUES (
      @symbol,
      @assetType,
      @baseAsset,
      @quoteAsset,
      @source,
      @displayName,
      @providerSymbol,
      @priceUnit,
      @metadataJson,
      @isActive,
      datetime('now')
    )
    ON CONFLICT(symbol) DO UPDATE SET
      asset_type = excluded.asset_type,
      base_asset = excluded.base_asset,
      quote_asset = excluded.quote_asset,
      source = excluded.source,
      display_name = excluded.display_name,
      provider_symbol = excluded.provider_symbol,
      price_unit = excluded.price_unit,
      metadata_json = excluded.metadata_json,
      is_active = excluded.is_active,
      updated_at = datetime('now')
  `);

  const insertMany = db.transaction((items: AppSymbolConfig[]) => {
    for (const symbol of items) {
      statement.run({
        ...symbol,
        displayName: symbol.displayName ?? null,
        providerSymbol: symbol.providerSymbol ?? symbol.symbol,
        priceUnit: symbol.priceUnit ?? symbol.quoteAsset,
        metadataJson: symbol.metadata ? JSON.stringify(symbol.metadata) : null,
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
