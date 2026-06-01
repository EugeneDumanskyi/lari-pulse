import type Database from "better-sqlite3";
import type { NewPortfolioItem, PortfolioItemRecord } from "../types";

interface PortfolioItemDbRow {
  id: number;
  symbol: string;
  quantity: number;
  average_cost: number | null;
  quote_currency: string;
  label: string | null;
  notes: string | null;
  include_in_risk: number;
  created_at: string;
  updated_at: string;
}

function mapPortfolioItem(row: PortfolioItemDbRow): PortfolioItemRecord {
  return {
    id: row.id,
    symbol: row.symbol,
    quantity: row.quantity,
    averageCost: row.average_cost,
    quoteCurrency: row.quote_currency,
    label: row.label,
    notes: row.notes,
    includeInRisk: row.include_in_risk === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function insertPortfolioItem(db: Database.Database, item: NewPortfolioItem) {
  const info = db
    .prepare(
      `
      INSERT INTO portfolio_items (
        symbol,
        quantity,
        average_cost,
        quote_currency,
        label,
        notes,
        include_in_risk
      )
      VALUES (
        @symbol,
        @quantity,
        @averageCost,
        @quoteCurrency,
        @label,
        @notes,
        @includeInRisk
      )
    `
    )
    .run({
      ...item,
      includeInRisk: item.includeInRisk ? 1 : 0
    });

  return Number(info.lastInsertRowid);
}

export function updatePortfolioItem(
  db: Database.Database,
  id: number,
  patch: Partial<NewPortfolioItem>
) {
  const current = getPortfolioItemById(db, id);

  if (!current) {
    return null;
  }

  db
    .prepare(
      `
      UPDATE portfolio_items
      SET
        symbol = @symbol,
        quantity = @quantity,
        average_cost = @averageCost,
        quote_currency = @quoteCurrency,
        label = @label,
        notes = @notes,
        include_in_risk = @includeInRisk,
        updated_at = datetime('now')
      WHERE id = @id
    `
    )
    .run({
      id,
      symbol: patch.symbol ?? current.symbol,
      quantity: patch.quantity ?? current.quantity,
      averageCost: patch.averageCost === undefined ? current.averageCost : patch.averageCost,
      quoteCurrency: patch.quoteCurrency ?? current.quoteCurrency,
      label: patch.label === undefined ? current.label : patch.label,
      notes: patch.notes === undefined ? current.notes : patch.notes,
      includeInRisk: (patch.includeInRisk ?? current.includeInRisk) ? 1 : 0
    });

  return getPortfolioItemById(db, id);
}

export function deletePortfolioItem(db: Database.Database, id: number) {
  const info = db.prepare("DELETE FROM portfolio_items WHERE id = ?").run(id);
  return info.changes > 0;
}

export function getPortfolioItemById(db: Database.Database, id: number) {
  const row = db.prepare("SELECT * FROM portfolio_items WHERE id = ?").get(id) as PortfolioItemDbRow | undefined;
  return row ? mapPortfolioItem(row) : null;
}

export function listPortfolioItems(db: Database.Database, filters: { symbols?: string[] } = {}) {
  const symbols = filters.symbols ?? [];

  if (symbols.length === 0) {
    const rows = db
      .prepare(
        `
        SELECT *
        FROM portfolio_items
        ORDER BY include_in_risk DESC, symbol ASC, id ASC
      `
      )
      .all() as PortfolioItemDbRow[];

    return rows.map(mapPortfolioItem);
  }

  const placeholders = symbols.map((_, index) => `@symbol${index}`).join(", ");
  const params = Object.fromEntries(symbols.map((symbol, index) => [`symbol${index}`, symbol]));
  const rows = db
    .prepare(
      `
      SELECT *
      FROM portfolio_items
      WHERE symbol IN (${placeholders})
      ORDER BY include_in_risk DESC, symbol ASC, id ASC
    `
    )
    .all(params) as PortfolioItemDbRow[];

  return rows.map(mapPortfolioItem);
}
