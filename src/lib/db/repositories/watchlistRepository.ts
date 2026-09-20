import type Database from "better-sqlite3";
import type { NewWatchlistItem, WatchlistItemRecord } from "../types";

interface WatchlistItemDbRow {
  id: number;
  user_id: number;
  symbol: string;
  timeframe: string;
  note: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

function mapWatchlistItem(row: WatchlistItemDbRow): WatchlistItemRecord {
  return {
    id: row.id,
    userId: row.user_id,
    symbol: row.symbol,
    timeframe: row.timeframe,
    note: row.note,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function insertWatchlistItem(db: Database.Database, item: NewWatchlistItem) {
  const info = db
    .prepare(
      `
      INSERT INTO watchlist_items (
        user_id,
        symbol,
        timeframe,
        note,
        position
      )
      VALUES (
        @userId,
        @symbol,
        @timeframe,
        @note,
        @position
      )
    `
    )
    .run(item);

  return Number(info.lastInsertRowid);
}

export function updateWatchlistItem(
  db: Database.Database,
  filters: { id: number; userId: number },
  patch: { note?: string | null; position?: number }
) {
  const current = getWatchlistItemForUser(db, filters);

  if (!current) {
    return null;
  }

  db
    .prepare(
      `
      UPDATE watchlist_items
      SET
        note = @note,
        position = @position,
        updated_at = datetime('now')
      WHERE id = @id
        AND user_id = @userId
    `
    )
    .run({
      id: filters.id,
      userId: filters.userId,
      note: patch.note === undefined ? current.note : patch.note,
      position: patch.position ?? current.position
    });

  return getWatchlistItemForUser(db, filters);
}

export function deleteWatchlistItemForUser(db: Database.Database, filters: { id: number; userId: number }) {
  const info = db
    .prepare("DELETE FROM watchlist_items WHERE id = @id AND user_id = @userId")
    .run(filters);

  return info.changes > 0;
}

export function getWatchlistItemForUser(db: Database.Database, filters: { id: number; userId: number }) {
  const row = db
    .prepare("SELECT * FROM watchlist_items WHERE id = @id AND user_id = @userId")
    .get(filters) as WatchlistItemDbRow | undefined;

  return row ? mapWatchlistItem(row) : null;
}

export function listWatchlistItems(db: Database.Database, filters: { userId: number }) {
  const rows = db
    .prepare(
      `
      SELECT *
      FROM watchlist_items
      WHERE user_id = @userId
      ORDER BY position ASC, id ASC
    `
    )
    .all(filters) as WatchlistItemDbRow[];

  return rows.map(mapWatchlistItem);
}

/** The next free position for the user, so a new row lands at the end. */
export function nextWatchlistPosition(db: Database.Database, filters: { userId: number }) {
  const row = db
    .prepare(
      `
      SELECT COALESCE(MAX(position), -1) + 1 AS next
      FROM watchlist_items
      WHERE user_id = @userId
    `
    )
    .get(filters) as { next: number };

  return row.next;
}

/** Rewrites the user's rows to a dense 0..n-1 in position ASC, id ASC order. */
export function reindexWatchlistPositions(db: Database.Database, filters: { userId: number }) {
  const rows = listWatchlistItems(db, filters);
  const statement = db.prepare(
    `
      UPDATE watchlist_items
      SET position = @position
      WHERE id = @id
        AND user_id = @userId
    `
  );

  rows.forEach((row, index) => {
    if (row.position === index) {
      return;
    }

    statement.run({ id: row.id, userId: filters.userId, position: index });
  });
}
