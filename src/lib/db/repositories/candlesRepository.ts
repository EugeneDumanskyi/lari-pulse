import type Database from "better-sqlite3";
import type { CandleRecord, NewCandle } from "../types";

interface CandleRow {
  id: number;
  symbol: string;
  timeframe: string;
  open_time: number;
  close_time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source: string;
  created_at: string;
}

function mapCandle(row: CandleRow): CandleRecord {
  return {
    id: row.id,
    symbol: row.symbol,
    timeframe: row.timeframe,
    openTime: row.open_time,
    closeTime: row.close_time,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume,
    source: row.source,
    createdAt: row.created_at
  };
}

export function upsertCandles(db: Database.Database, candles: NewCandle[]) {
  const statement = db.prepare(`
    INSERT INTO candles (
      symbol,
      timeframe,
      open_time,
      close_time,
      open,
      high,
      low,
      close,
      volume,
      source
    )
    VALUES (
      @symbol,
      @timeframe,
      @openTime,
      @closeTime,
      @open,
      @high,
      @low,
      @close,
      @volume,
      @source
    )
    ON CONFLICT(symbol, timeframe, open_time, source) DO UPDATE SET
      close_time = excluded.close_time,
      open = excluded.open,
      high = excluded.high,
      low = excluded.low,
      close = excluded.close,
      volume = excluded.volume
  `);

  const upsertMany = db.transaction((items: NewCandle[]) => {
    let changed = 0;

    for (const candle of items) {
      changed += statement.run(candle).changes;
    }

    return changed;
  });

  return upsertMany(candles);
}

export function getCandlesBySymbolTimeframe(
  db: Database.Database,
  symbol: string,
  timeframe: string,
  limit = 500
): CandleRecord[] {
  const rows = db
    .prepare(
      `
      SELECT *
      FROM candles
      WHERE symbol = @symbol
        AND timeframe = @timeframe
      ORDER BY open_time DESC
      LIMIT @limit
    `
    )
    .all({ symbol, timeframe, limit }) as CandleRow[];

  return rows.map(mapCandle).reverse();
}
