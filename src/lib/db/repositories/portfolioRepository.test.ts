import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { runMigrations } from "@/lib/db/migrations";
import {
  deletePortfolioItem,
  getPortfolioItemById,
  insertPortfolioItem,
  listPortfolioItems,
  updatePortfolioItem
} from "./portfolioRepository";

function createMemoryDatabase() {
  const db = new Database(":memory:");
  runMigrations(db);
  return db;
}

describe("portfolio repository", () => {
  it("creates, updates, filters, and deletes portfolio items", () => {
    const db = createMemoryDatabase();
    const id = insertPortfolioItem(db, {
      symbol: "BTCUSDT",
      quantity: 0.5,
      averageCost: 80000,
      quoteCurrency: "USDT",
      label: "Core BTC",
      notes: "Long-term exposure",
      includeInRisk: true
    });

    const item = getPortfolioItemById(db, id);
    assert.equal(item?.symbol, "BTCUSDT");
    assert.equal(item?.includeInRisk, true);

    const updated = updatePortfolioItem(db, id, {
      quantity: 0.75,
      label: "Updated BTC",
      includeInRisk: false
    });
    assert.equal(updated?.quantity, 0.75);
    assert.equal(updated?.label, "Updated BTC");
    assert.equal(updated?.includeInRisk, false);

    insertPortfolioItem(db, {
      symbol: "ETHUSDT",
      quantity: 2,
      averageCost: null,
      quoteCurrency: "USDT",
      label: null,
      notes: null,
      includeInRisk: true
    });

    assert.deepEqual(
      listPortfolioItems(db, { symbols: ["BTCUSDT"] }).map((entry) => entry.symbol),
      ["BTCUSDT"]
    );

    assert.equal(deletePortfolioItem(db, id), true);
    assert.equal(getPortfolioItemById(db, id), null);
  });
});
