import type Database from "better-sqlite3";
import type {
  LiquidationEventRecord,
  LiquidationLargestEvent,
  LiquidationSide,
  LiquidationSymbolAggregate,
  LiquidationTimelineBucket,
  NewLiquidationEvent
} from "../types";

interface LiquidationEventRow {
  id: number;
  event_id: string;
  symbol: string;
  source: string;
  event_time: number;
  liquidation_side: "long" | "short";
  order_side: string;
  price: number;
  quantity: number;
  notional_usd: number;
  metadata_json: string | null;
  created_at: string;
}

export interface LiquidationEventAggregate {
  symbol: string;
  source: string;
  fromTime: number;
  toTime: number;
  longCount: number;
  shortCount: number;
  longNotionalUsd: number;
  shortNotionalUsd: number;
  totalNotionalUsd: number;
  totalLiquidatedUsd: number;
  longLiquidatedUsd: number;
  shortLiquidatedUsd: number;
  longShortImbalance: number;
  eventCount: number;
  largestLiquidation: LiquidationLargestEvent | null;
  topSymbolsByLiquidation: LiquidationSymbolAggregate[];
  timeline: LiquidationTimelineBucket[];
}

function toStoredLiquidationSide(side: LiquidationSide) {
  return side === "long_liquidated" ? "long" : "short";
}

function toLiquidationSide(side: "long" | "short"): LiquidationSide {
  return side === "long" ? "long_liquidated" : "short_liquidated";
}

function mapLiquidationEvent(row: LiquidationEventRow): LiquidationEventRecord {
  return {
    id: row.id,
    eventId: row.event_id,
    symbol: row.symbol,
    source: row.source,
    eventTime: row.event_time,
    side: toLiquidationSide(row.liquidation_side),
    liquidationSide: row.liquidation_side,
    orderSide: row.order_side,
    price: row.price,
    quantity: row.quantity,
    notionalUsd: row.notional_usd,
    metadataJson: row.metadata_json,
    createdAt: row.created_at
  };
}

export function insertLiquidationEvents(db: Database.Database, events: NewLiquidationEvent[]) {
  const statement = db.prepare(`
    INSERT INTO liquidation_events (
      event_id,
      symbol,
      source,
      event_time,
      liquidation_side,
      order_side,
      price,
      quantity,
      notional_usd,
      metadata_json
    )
    VALUES (
      @eventId,
      @symbol,
      @source,
      @eventTime,
      @liquidationSide,
      @orderSide,
      @price,
      @quantity,
      @notionalUsd,
      @metadataJson
    )
    ON CONFLICT(event_id) DO NOTHING
  `);

  const insertMany = db.transaction((items: NewLiquidationEvent[]) => {
    let inserted = 0;

    for (const event of items) {
      inserted += statement.run({
        ...event,
        liquidationSide: toStoredLiquidationSide(event.side),
        metadataJson: event.metadataJson ?? null
      }).changes;
    }

    return inserted;
  });

  return insertMany(events);
}

export function getLiquidationEvents(
  db: Database.Database,
  filters: { symbol: string; fromTime: number; toTime: number; source?: string; limit?: number }
) {
  const conditions = [
    "symbol = @symbol",
    "event_time >= @fromTime",
    "event_time < @toTime"
  ];
  const params: Record<string, string | number> = {
    symbol: filters.symbol,
    fromTime: filters.fromTime,
    toTime: filters.toTime,
    limit: filters.limit ?? 500
  };

  if (filters.source) {
    conditions.push("source = @source");
    params.source = filters.source;
  }

  const rows = db
    .prepare(
      `
      SELECT *
      FROM liquidation_events
      WHERE ${conditions.join(" AND ")}
      ORDER BY event_time DESC
      LIMIT @limit
    `
    )
    .all(params) as LiquidationEventRow[];

  return rows.map(mapLiquidationEvent);
}

export function aggregateLiquidationEvents(
  db: Database.Database,
  filters: { symbol: string; fromTime: number; toTime: number; source?: string; bucketSizeMs?: number }
): LiquidationEventAggregate {
  const conditions = [
    "symbol = @symbol",
    "event_time >= @fromTime",
    "event_time < @toTime"
  ];
  const params: Record<string, string | number> = {
    symbol: filters.symbol,
    fromTime: filters.fromTime,
    toTime: filters.toTime
  };

  if (filters.source) {
    conditions.push("source = @source");
    params.source = filters.source;
  }
  const topSymbolConditions = [
    "event_time >= @fromTime",
    "event_time < @toTime"
  ];

  if (filters.source) {
    topSymbolConditions.push("source = @source");
  }

  const row = db
    .prepare(
      `
      SELECT
        SUM(CASE WHEN liquidation_side = 'long' THEN 1 ELSE 0 END) AS long_count,
        SUM(CASE WHEN liquidation_side = 'short' THEN 1 ELSE 0 END) AS short_count,
        SUM(CASE WHEN liquidation_side = 'long' THEN notional_usd ELSE 0 END) AS long_notional_usd,
        SUM(CASE WHEN liquidation_side = 'short' THEN notional_usd ELSE 0 END) AS short_notional_usd,
        SUM(notional_usd) AS total_notional_usd
      FROM liquidation_events
      WHERE ${conditions.join(" AND ")}
    `
    )
    .get(params) as
    | {
        long_count: number | null;
        short_count: number | null;
        long_notional_usd: number | null;
        short_notional_usd: number | null;
        total_notional_usd: number | null;
      }
    | undefined;
  const largestRow = db
    .prepare(
      `
      SELECT *
      FROM liquidation_events
      WHERE ${conditions.join(" AND ")}
      ORDER BY notional_usd DESC, event_time DESC
      LIMIT 1
    `
    )
    .get(params) as LiquidationEventRow | undefined;
  const topRows = db
    .prepare(
      `
      SELECT
        symbol,
        SUM(CASE WHEN liquidation_side = 'long' THEN notional_usd ELSE 0 END) AS long_liquidated_usd,
        SUM(CASE WHEN liquidation_side = 'short' THEN notional_usd ELSE 0 END) AS short_liquidated_usd,
        SUM(notional_usd) AS total_liquidated_usd,
        COUNT(*) AS event_count
      FROM liquidation_events
      WHERE ${topSymbolConditions.join(" AND ")}
      GROUP BY symbol
      ORDER BY total_liquidated_usd DESC
      LIMIT 5
    `
    )
    .all(params) as Array<{
      symbol: string;
      long_liquidated_usd: number | null;
      short_liquidated_usd: number | null;
      total_liquidated_usd: number | null;
      event_count: number | null;
    }>;
  const bucketSizeMs = Math.max(1, filters.bucketSizeMs ?? filters.toTime - filters.fromTime);
  const bucketRows = db
    .prepare(
      `
      SELECT
        CAST((event_time - @fromTime) / @bucketSizeMs AS INTEGER) AS bucket_index,
        SUM(CASE WHEN liquidation_side = 'long' THEN notional_usd ELSE 0 END) AS long_liquidated_usd,
        SUM(CASE WHEN liquidation_side = 'short' THEN notional_usd ELSE 0 END) AS short_liquidated_usd,
        SUM(notional_usd) AS total_liquidated_usd,
        COUNT(*) AS event_count
      FROM liquidation_events
      WHERE ${conditions.join(" AND ")}
      GROUP BY bucket_index
      ORDER BY bucket_index ASC
    `
    )
    .all({
      ...params,
      bucketSizeMs
    }) as Array<{
      bucket_index: number;
      long_liquidated_usd: number | null;
      short_liquidated_usd: number | null;
      total_liquidated_usd: number | null;
      event_count: number | null;
    }>;

  const totalNotionalUsd = row?.total_notional_usd ?? 0;
  const longNotionalUsd = row?.long_notional_usd ?? 0;
  const shortNotionalUsd = row?.short_notional_usd ?? 0;
  const totalCount = (row?.long_count ?? 0) + (row?.short_count ?? 0);
  const bucketMap = new Map(bucketRows.map((bucket) => [bucket.bucket_index, bucket]));
  const bucketCount = Math.max(1, Math.ceil((filters.toTime - filters.fromTime) / bucketSizeMs));
  const timeline = Array.from({ length: bucketCount }, (_, index) => {
    const bucket = bucketMap.get(index);
    const bucketFrom = filters.fromTime + index * bucketSizeMs;

    return {
      fromTime: bucketFrom,
      toTime: Math.min(filters.toTime, bucketFrom + bucketSizeMs),
      longLiquidatedUsd: bucket?.long_liquidated_usd ?? 0,
      shortLiquidatedUsd: bucket?.short_liquidated_usd ?? 0,
      totalLiquidatedUsd: bucket?.total_liquidated_usd ?? 0,
      eventCount: bucket?.event_count ?? 0
    };
  });

  return {
    symbol: filters.symbol,
    source: filters.source ?? "all",
    fromTime: filters.fromTime,
    toTime: filters.toTime,
    longCount: row?.long_count ?? 0,
    shortCount: row?.short_count ?? 0,
    longNotionalUsd,
    shortNotionalUsd,
    totalNotionalUsd,
    longLiquidatedUsd: longNotionalUsd,
    shortLiquidatedUsd: shortNotionalUsd,
    totalLiquidatedUsd: totalNotionalUsd,
    longShortImbalance: totalNotionalUsd > 0 ? (longNotionalUsd - shortNotionalUsd) / totalNotionalUsd : 0,
    eventCount: totalCount,
    largestLiquidation: largestRow
      ? {
          id: largestRow.id,
          eventId: largestRow.event_id,
          symbol: largestRow.symbol,
          side: toLiquidationSide(largestRow.liquidation_side),
          price: largestRow.price,
          quantity: largestRow.quantity,
          notionalUsd: largestRow.notional_usd,
          timestamp: largestRow.event_time,
          source: largestRow.source
        }
      : null,
    topSymbolsByLiquidation: topRows.map((topRow) => ({
      symbol: topRow.symbol,
      totalLiquidatedUsd: topRow.total_liquidated_usd ?? 0,
      longLiquidatedUsd: topRow.long_liquidated_usd ?? 0,
      shortLiquidatedUsd: topRow.short_liquidated_usd ?? 0,
      eventCount: topRow.event_count ?? 0
    })),
    timeline
  };
}

export function deleteOldLiquidationEvents(db: Database.Database, olderThanTime: number) {
  return db
    .prepare(
      `
      DELETE FROM liquidation_events
      WHERE event_time < @olderThanTime
    `
    )
    .run({ olderThanTime }).changes;
}
