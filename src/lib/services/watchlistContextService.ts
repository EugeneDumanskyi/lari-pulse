import type Database from "better-sqlite3";
import { canAccessSymbol, requireUser, type AuthSession } from "@/lib/auth/access";
import { getDatabase } from "@/lib/db/client";
import { initializeDatabase } from "@/lib/db/initialize";
import { getCandlesBySymbolTimeframe } from "@/lib/db/repositories/candlesRepository";
import { getLatestSituationOverview } from "@/lib/db/repositories/situationOverviewRepository";
import {
  deleteWatchlistItemForUser,
  getWatchlistItemForUser,
  insertWatchlistItem,
  listWatchlistItems,
  nextWatchlistPosition,
  reindexWatchlistPositions,
  updateWatchlistItem
} from "@/lib/db/repositories/watchlistRepository";
import type { NewWatchlistItem, WatchlistItemRecord } from "@/lib/db/types";
import type {
  SituationDriver,
  SituationOverview,
  SituationWatchCondition
} from "@/lib/services/situationOverview/situationOverview.types";
import { ApiInputError, validateCollectionTimeframe, validateSymbol } from "./apiValidation";

export interface WatchlistItemInput {
  symbol: string;
  timeframe: string;
  note?: string | null;
}

export interface WatchlistItemPatch {
  note?: string | null;
  position?: number;
}

export interface WatchlistSituationApi {
  title: string;
  summary: string;
  bias: SituationOverview["bias"];
  riskLevel: SituationOverview["riskLevel"];
  confidence: SituationOverview["confidence"];
  score: number;
  riskScore: number;
  strongestDriver: SituationDriver | null;
  generatedAt: string;
}

export interface WatchlistItemApi {
  id: number;
  symbol: string;
  timeframe: string;
  note: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  currentPrice: number | null;
  priceUpdatedAt: string | null;
  situation: WatchlistSituationApi | null;
  watchConditions: SituationWatchCondition[];
  isStale: boolean;
}

export interface WatchlistContextApi {
  items: WatchlistItemApi[];
  summary: {
    itemCount: number;
    missingPriceCount: number;
    missingOverviewCount: number;
    staleCount: number;
    newestStateAt: string | null;
    updatedAt: string;
  };
  notes: string[];
}

const NOTE_MAX_LENGTH = 280;

/** A row is stale when its newest stored state is older than three of its own intervals. */
const STALE_INTERVAL_MULTIPLIER = 3;

const timeframeIntervalMs: Record<string, number> = {
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000
};

function ensureDatabase(db?: Database.Database) {
  if (!db) {
    initializeDatabase();
  }

  return db ?? getDatabase();
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function cleanText(value: string | null | undefined, fallback: string | null = null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function validateNote(value: string | null | undefined) {
  const note = cleanText(value);

  if (note && note.length > NOTE_MAX_LENGTH) {
    throw new ApiInputError(`note must be ${NOTE_MAX_LENGTH} characters or fewer`);
  }

  return note;
}

function normalizeWatchlistInput(
  input: WatchlistItemInput,
  session: AuthSession,
  userId: number
): Omit<NewWatchlistItem, "position"> {
  const symbol = validateSymbol(input.symbol ?? "");

  if (!canAccessSymbol(session, symbol)) {
    throw new ApiInputError(`Unsupported symbol: ${symbol}`);
  }

  return {
    userId,
    symbol,
    timeframe: validateCollectionTimeframe(input.timeframe ?? ""),
    note: validateNote(input.note)
  };
}

function pairLabel(symbol: string, timeframe: string) {
  return `${symbol} ${timeframe}`;
}

function latestPriceForPair(db: Database.Database, symbol: string, timeframe: string) {
  // No fallback across timeframes: borrowing another timeframe's close would
  // misreport what the row is about.
  const candle = getCandlesBySymbolTimeframe(db, symbol, timeframe, 1)[0];

  if (!candle) {
    return { price: null, updatedAt: null };
  }

  return {
    price: candle.close,
    updatedAt: new Date(candle.closeTime).toISOString()
  };
}

function situationForPair(db: Database.Database, symbol: string, timeframe: string) {
  const record = getLatestSituationOverview(db, { symbol, timeframe });

  if (!record) {
    return { situation: null, watchConditions: [] as SituationWatchCondition[] };
  }

  const drivers = parseJson<SituationDriver[]>(record.mainDriversJson, []);

  return {
    situation: {
      title: record.title,
      summary: record.summary,
      bias: record.bias as SituationOverview["bias"],
      riskLevel: record.riskLevel as SituationOverview["riskLevel"],
      confidence: record.confidence as SituationOverview["confidence"],
      score: record.score,
      riskScore: record.riskScore,
      strongestDriver: drivers[0] ?? null,
      generatedAt: record.generatedAt
    } satisfies WatchlistSituationApi,
    watchConditions: parseJson<SituationWatchCondition[]>(record.watchConditionsJson, [])
  };
}

function isStoredStateStale(timeframe: string, timestamps: Array<string | null>, now: number) {
  const interval = timeframeIntervalMs[timeframe];

  if (!interval) {
    return false;
  }

  const threshold = interval * STALE_INTERVAL_MULTIPLIER;

  return timestamps.some((value) => {
    if (value === null) {
      return false;
    }

    const at = new Date(value).getTime();
    return Number.isFinite(at) && now - at > threshold;
  });
}

function toWatchlistItemApi(db: Database.Database, item: WatchlistItemRecord, now: number): WatchlistItemApi {
  const latest = latestPriceForPair(db, item.symbol, item.timeframe);
  const { situation, watchConditions } = situationForPair(db, item.symbol, item.timeframe);
  const { userId: _userId, ...record } = item;

  return {
    ...record,
    currentPrice: latest.price,
    priceUpdatedAt: latest.updatedAt,
    situation,
    watchConditions,
    isStale: isStoredStateStale(item.timeframe, [latest.updatedAt, situation?.generatedAt ?? null], now)
  };
}

function buildSummary(items: WatchlistItemApi[]) {
  const generatedAtValues = items
    .map((item) => item.situation?.generatedAt)
    .filter((value): value is string => Boolean(value))
    .sort();

  return {
    itemCount: items.length,
    missingPriceCount: items.filter((item) => item.currentPrice === null).length,
    missingOverviewCount: items.filter((item) => !item.situation).length,
    staleCount: items.filter((item) => item.isStale).length,
    newestStateAt: generatedAtValues[generatedAtValues.length - 1] ?? null,
    updatedAt: new Date().toISOString()
  };
}

function buildNotes(items: WatchlistItemApi[]) {
  const notes: string[] = [];

  const withoutPrice = items
    .filter((item) => item.currentPrice === null)
    .map((item) => pairLabel(item.symbol, item.timeframe));
  if (withoutPrice.length > 0) {
    notes.push(`Missing stored prices for ${Array.from(new Set(withoutPrice)).join(", ")}.`);
  }

  const withoutSituation = items
    .filter((item) => !item.situation)
    .map((item) => pairLabel(item.symbol, item.timeframe));
  if (withoutSituation.length > 0) {
    notes.push(`Run Situation Overview for ${Array.from(new Set(withoutSituation)).join(", ")} to enable state context.`);
  }

  return notes;
}

export function getWatchlistContext(options: {
  session: AuthSession;
  db?: Database.Database;
}): WatchlistContextApi {
  const user = requireUser(options.session, "viewer");
  const db = ensureDatabase(options.db);
  const now = Date.now();
  const items = listWatchlistItems(db, { userId: user.userId }).map((item) => toWatchlistItemApi(db, item, now));

  return {
    items,
    summary: buildSummary(items),
    notes: buildNotes(items)
  };
}

export function createWatchlistItemForSession(options: {
  session: AuthSession;
  input: WatchlistItemInput;
  db?: Database.Database;
}): WatchlistItemRecord {
  const user = requireUser(options.session, "viewer");
  const db = ensureDatabase(options.db);
  const normalized = normalizeWatchlistInput(options.input, options.session, user.userId);
  const duplicate = listWatchlistItems(db, { userId: user.userId }).some(
    (item) => item.symbol === normalized.symbol && item.timeframe === normalized.timeframe
  );

  if (duplicate) {
    throw new ApiInputError(
      `${pairLabel(normalized.symbol, normalized.timeframe)} is already on your watchlist.`
    );
  }

  const id = insertWatchlistItem(db, {
    ...normalized,
    position: nextWatchlistPosition(db, { userId: user.userId })
  });
  const item = getWatchlistItemForUser(db, { id, userId: user.userId });

  if (!item) {
    throw new Error("Watchlist item was not created");
  }

  return item;
}

function moveWatchlistItem(
  db: Database.Database,
  filters: { id: number; userId: number },
  target: number
) {
  db.transaction(() => {
    const ordered = listWatchlistItems(db, { userId: filters.userId });
    const from = ordered.findIndex((item) => item.id === filters.id);

    if (from === -1) {
      return;
    }

    const to = Math.min(Math.max(Math.trunc(target), 0), ordered.length - 1);
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);

    ordered.forEach((item, index) => {
      if (item.position === index) {
        return;
      }

      updateWatchlistItem(db, { id: item.id, userId: filters.userId }, { position: index });
    });

    reindexWatchlistPositions(db, { userId: filters.userId });
  })();
}

export function updateWatchlistItemForSession(options: {
  session: AuthSession;
  id: number;
  input: WatchlistItemPatch;
  db?: Database.Database;
}): WatchlistItemRecord {
  const user = requireUser(options.session, "viewer");
  const db = ensureDatabase(options.db);
  const input = options.input ?? {};

  if ("symbol" in input || "timeframe" in input) {
    throw new ApiInputError("symbol and timeframe cannot be changed; remove the row and add the new pair");
  }

  const filters = { id: options.id, userId: user.userId };
  const current = getWatchlistItemForUser(db, filters);

  if (!current) {
    throw new ApiInputError("Watchlist item not found", 404);
  }

  if (input.note !== undefined) {
    updateWatchlistItem(db, filters, { note: validateNote(input.note) });
  }

  if (input.position !== undefined) {
    if (!Number.isFinite(input.position)) {
      throw new ApiInputError("position must be a number");
    }

    moveWatchlistItem(db, filters, input.position);
  }

  const updated = getWatchlistItemForUser(db, filters);

  if (!updated) {
    throw new ApiInputError("Watchlist item not found", 404);
  }

  return updated;
}

export function deleteWatchlistItemForSession(options: {
  session: AuthSession;
  id: number;
  db?: Database.Database;
}): boolean {
  const user = requireUser(options.session, "viewer");
  const db = ensureDatabase(options.db);
  const filters = { id: options.id, userId: user.userId };

  if (!getWatchlistItemForUser(db, filters)) {
    throw new ApiInputError("Watchlist item not found", 404);
  }

  const deleted = deleteWatchlistItemForUser(db, filters);
  reindexWatchlistPositions(db, { userId: user.userId });

  return deleted;
}
