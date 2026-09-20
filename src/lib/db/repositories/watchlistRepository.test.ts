import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { runMigrations } from "@/lib/db/migrations";
import { createUser, deleteUser } from "./accountRepository";
import {
  deleteWatchlistItemForUser,
  getWatchlistItemForUser,
  insertWatchlistItem,
  listWatchlistItems,
  nextWatchlistPosition,
  reindexWatchlistPositions
} from "./watchlistRepository";

function createMemoryDatabase() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

function createOwner(db: Database.Database, email: string) {
  return createUser(db, { email, passwordHash: "x", role: "viewer", status: "active" }).id;
}

function addItem(
  db: Database.Database,
  userId: number,
  symbol: string,
  timeframe: string,
  position: number,
  note: string | null = null
) {
  return insertWatchlistItem(db, { userId, symbol, timeframe, note, position });
}

describe("watchlist repository", () => {
  it("rejects a duplicate symbol and timeframe for one user", () => {
    const db = createMemoryDatabase();
    const userId = createOwner(db, "owner@example.com");
    addItem(db, userId, "BTCUSDT", "1h", 0);

    assert.throws(() => addItem(db, userId, "BTCUSDT", "1h", 1), /UNIQUE/);
    assert.equal(listWatchlistItems(db, { userId }).length, 1);
  });

  it("lets two users hold the same pair", () => {
    const db = createMemoryDatabase();
    const first = createOwner(db, "first@example.com");
    const second = createOwner(db, "second@example.com");

    addItem(db, first, "BTCUSDT", "1h", 0);
    addItem(db, second, "BTCUSDT", "1h", 0);

    assert.equal(listWatchlistItems(db, { userId: first }).length, 1);
    assert.equal(listWatchlistItems(db, { userId: second }).length, 1);
  });

  it("removes a user's rows when the user is deleted", () => {
    const db = createMemoryDatabase();
    const userId = createOwner(db, "leaving@example.com");
    const keeperId = createOwner(db, "staying@example.com");
    addItem(db, userId, "BTCUSDT", "1h", 0);
    addItem(db, keeperId, "ETHUSDT", "4h", 0);

    deleteUser(db, userId);

    assert.deepEqual(listWatchlistItems(db, { userId }), []);
    assert.equal(listWatchlistItems(db, { userId: keeperId }).length, 1);
  });

  it("orders rows by position then id", () => {
    const db = createMemoryDatabase();
    const userId = createOwner(db, "ordered@example.com");
    const third = addItem(db, userId, "SOLUSDT", "1d", 2);
    const tieSecond = addItem(db, userId, "ETHUSDT", "4h", 1);
    const tieFirst = addItem(db, userId, "BTCUSDT", "1h", 1);

    assert.deepEqual(
      listWatchlistItems(db, { userId }).map((item) => item.id),
      [tieSecond, tieFirst, third]
    );
  });

  it("returns the next free position", () => {
    const db = createMemoryDatabase();
    const userId = createOwner(db, "positions@example.com");

    assert.equal(nextWatchlistPosition(db, { userId }), 0);

    addItem(db, userId, "BTCUSDT", "1h", 0);
    addItem(db, userId, "ETHUSDT", "1h", 1);
    addItem(db, userId, "SOLUSDT", "1h", 2);

    assert.equal(nextWatchlistPosition(db, { userId }), 3);
  });

  it("reindexes to a dense 0..n-1 after a delete leaves a gap", () => {
    const db = createMemoryDatabase();
    const userId = createOwner(db, "dense@example.com");
    addItem(db, userId, "BTCUSDT", "1h", 0);
    const middle = addItem(db, userId, "ETHUSDT", "1h", 1);
    addItem(db, userId, "SOLUSDT", "1h", 2);

    deleteWatchlistItemForUser(db, { id: middle, userId });
    reindexWatchlistPositions(db, { userId });

    assert.deepEqual(
      listWatchlistItems(db, { userId }).map((item) => [item.symbol, item.position]),
      [["BTCUSDT", 0], ["SOLUSDT", 1]]
    );
  });

  it("does not return another user's row", () => {
    const db = createMemoryDatabase();
    const owner = createOwner(db, "owner-read@example.com");
    const other = createOwner(db, "other-read@example.com");
    const id = addItem(db, owner, "BTCUSDT", "1h", 0);

    assert.equal(getWatchlistItemForUser(db, { id, userId: other }), null);
    assert.equal(getWatchlistItemForUser(db, { id, userId: owner })?.symbol, "BTCUSDT");
  });

  it("does not delete another user's row", () => {
    const db = createMemoryDatabase();
    const owner = createOwner(db, "owner-delete@example.com");
    const other = createOwner(db, "other-delete@example.com");
    const id = addItem(db, owner, "BTCUSDT", "1h", 0);

    assert.equal(deleteWatchlistItemForUser(db, { id, userId: other }), false);
    assert.equal(listWatchlistItems(db, { userId: owner }).length, 1);
    assert.equal(deleteWatchlistItemForUser(db, { id, userId: owner }), true);
  });
});
