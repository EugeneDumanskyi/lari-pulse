import type Database from "better-sqlite3";
import { canAccessSymbol, requireUser, type AuthSession } from "@/lib/auth/access";
import { getDatabase } from "@/lib/db/client";
import { initializeDatabase } from "@/lib/db/initialize";
import { getCandlesBySymbolTimeframe } from "@/lib/db/repositories/candlesRepository";
import {
  deletePortfolioItem,
  getPortfolioItemById,
  insertPortfolioItem,
  listPortfolioItems,
  updatePortfolioItem
} from "@/lib/db/repositories/portfolioRepository";
import { getLatestSituationOverview } from "@/lib/db/repositories/situationOverviewRepository";
import type { NewPortfolioItem, PortfolioItemRecord } from "@/lib/db/types";
import type {
  SituationDriver,
  SituationOverview,
  SituationWatchCondition
} from "@/lib/services/situationOverview/situationOverview.types";
import { ApiInputError } from "./apiValidation";

export interface PortfolioItemInput {
  symbol: string;
  quantity?: number | null;
  averageCost?: number | null;
  quoteCurrency?: string | null;
  label?: string | null;
  notes?: string | null;
  includeInRisk?: boolean;
}

export interface PortfolioItemApi {
  id: number;
  symbol: string;
  quantity: number;
  averageCost: number | null;
  quoteCurrency: string;
  label: string | null;
  notes: string | null;
  includeInRisk: boolean;
  createdAt: string;
  updatedAt: string;
  currentPrice: number | null;
  marketValue: number | null;
  unrealizedPnl: number | null;
  unrealizedPnlPercent: number | null;
  concentrationPercent: number | null;
  situation: PortfolioSituationApi | null;
  watchConditions: SituationWatchCondition[];
}

export interface PortfolioSituationApi {
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

export interface PortfolioContextApi {
  items: PortfolioItemApi[];
  summary: {
    itemCount: number;
    watchedCount: number;
    riskIncludedCount: number;
    totalMarketValue: number;
    totalUnrealizedPnl: number | null;
    totalUnrealizedPnlPercent: number | null;
    largestHolding: {
      symbol: string;
      concentrationPercent: number;
      marketValue: number;
    } | null;
    highestRisk: {
      symbol: string;
      riskLevel: SituationOverview["riskLevel"];
      riskScore: number;
      driver: string | null;
    } | null;
    updatedAt: string;
  };
  notes: string[];
}

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

function validateMoney(value: number | null | undefined, label: string) {
  if (value === null || value === undefined) {
    return null;
  }

  if (!Number.isFinite(value) || value < 0) {
    throw new ApiInputError(`${label} must be a non-negative number`);
  }

  return value;
}

function validateQuantity(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return 0;
  }

  if (!Number.isFinite(value) || value < 0) {
    throw new ApiInputError("quantity must be a non-negative number");
  }

  return value;
}

function normalizePortfolioInput(input: PortfolioItemInput, session: AuthSession, userId: number): NewPortfolioItem {
  const symbol = input.symbol?.trim().toUpperCase();

  if (!symbol) {
    throw new ApiInputError("symbol is required");
  }

  if (!canAccessSymbol(session, symbol)) {
    throw new ApiInputError(`Unsupported symbol: ${symbol}`);
  }

  const quoteCurrency = cleanText(input.quoteCurrency, "USDT")?.toUpperCase() ?? "USDT";

  return {
    userId,
    symbol,
    quantity: validateQuantity(input.quantity),
    averageCost: validateMoney(input.averageCost, "averageCost"),
    quoteCurrency,
    label: cleanText(input.label),
    notes: cleanText(input.notes),
    includeInRisk: input.includeInRisk ?? true
  };
}

function normalizePortfolioPatch(input: Partial<PortfolioItemInput>, current: PortfolioItemRecord, session: AuthSession): Partial<NewPortfolioItem> {
  const patch: Partial<NewPortfolioItem> = {};

  if (input.symbol !== undefined) {
    const symbol = input.symbol?.trim().toUpperCase();

    if (!symbol) {
      throw new ApiInputError("symbol cannot be empty");
    }

    if (!canAccessSymbol(session, symbol)) {
      throw new ApiInputError(`Unsupported symbol: ${symbol}`);
    }

    patch.symbol = symbol;
  }

  if (input.quantity !== undefined) {
    patch.quantity = validateQuantity(input.quantity);
  }

  if (input.averageCost !== undefined) {
    patch.averageCost = validateMoney(input.averageCost, "averageCost");
  }

  if (input.quoteCurrency !== undefined) {
    patch.quoteCurrency = cleanText(input.quoteCurrency, current.quoteCurrency)?.toUpperCase() ?? current.quoteCurrency;
  }

  if (input.label !== undefined) {
    patch.label = cleanText(input.label);
  }

  if (input.notes !== undefined) {
    patch.notes = cleanText(input.notes);
  }

  if (input.includeInRisk !== undefined) {
    patch.includeInRisk = Boolean(input.includeInRisk);
  }

  return patch;
}

function latestPriceForSymbol(db: Database.Database, symbol: string) {
  for (const timeframe of ["1h", "15m", "4h", "1d"]) {
    const candle = getCandlesBySymbolTimeframe(db, symbol, timeframe, 1)[0];

    if (candle) {
      return {
        price: candle.close,
        updatedAt: new Date(candle.closeTime).toISOString()
      };
    }
  }

  return {
    price: null,
    updatedAt: null
  };
}

function situationForSymbol(db: Database.Database, symbol: string): PortfolioSituationApi | null {
  const record = getLatestSituationOverview(db, {
    symbol,
    timeframe: "1h"
  });

  if (!record) {
    return null;
  }

  const drivers = parseJson<SituationDriver[]>(record.mainDriversJson, []);

  return {
    title: record.title,
    summary: record.summary,
    bias: record.bias as SituationOverview["bias"],
    riskLevel: record.riskLevel as SituationOverview["riskLevel"],
    confidence: record.confidence as SituationOverview["confidence"],
    score: record.score,
    riskScore: record.riskScore,
    strongestDriver: drivers[0] ?? null,
    generatedAt: record.generatedAt
  };
}

function watchConditionsForSymbol(db: Database.Database, symbol: string) {
  const record = getLatestSituationOverview(db, {
    symbol,
    timeframe: "1h"
  });

  if (!record) {
    return [];
  }

  return parseJson<SituationWatchCondition[]>(record.watchConditionsJson, []);
}

function riskRank(level: SituationOverview["riskLevel"]) {
  return {
    unknown: 0,
    low: 1,
    moderate: 2,
    elevated: 3,
    high: 4,
    extreme: 5
  }[level] ?? 0;
}

function toPortfolioItemApi(
  db: Database.Database,
  item: PortfolioItemRecord,
  totalMarketValue: number
): PortfolioItemApi {
  const latest = latestPriceForSymbol(db, item.symbol);
  const marketValue = latest.price === null ? null : latest.price * item.quantity;
  const unrealizedPnl = latest.price !== null && item.averageCost !== null
    ? (latest.price - item.averageCost) * item.quantity
    : null;
  const costBasis = item.averageCost !== null ? item.averageCost * item.quantity : null;

  const { userId: _userId, ...record } = item;

  return {
    ...record,
    currentPrice: latest.price,
    marketValue,
    unrealizedPnl,
    unrealizedPnlPercent: costBasis && unrealizedPnl !== null ? (unrealizedPnl / costBasis) * 100 : null,
    concentrationPercent: marketValue !== null && totalMarketValue > 0 ? (marketValue / totalMarketValue) * 100 : null,
    situation: situationForSymbol(db, item.symbol),
    watchConditions: watchConditionsForSymbol(db, item.symbol)
  };
}

function buildSummary(items: PortfolioItemApi[]) {
  const valuedItems = items.filter((item) => item.includeInRisk && item.marketValue !== null);
  const totalMarketValue = valuedItems.reduce((sum, item) => sum + (item.marketValue ?? 0), 0);
  const pnlItems = valuedItems.filter((item) => item.unrealizedPnl !== null);
  const totalUnrealizedPnl = pnlItems.length > 0
    ? pnlItems.reduce((sum, item) => sum + (item.unrealizedPnl ?? 0), 0)
    : null;
  const totalCostBasis = pnlItems.reduce((sum, item) => {
    if (item.averageCost === null) {
      return sum;
    }

    return sum + item.averageCost * item.quantity;
  }, 0);
  const largestHolding = valuedItems
    .filter((item): item is PortfolioItemApi & { marketValue: number; concentrationPercent: number } =>
      item.marketValue !== null && item.concentrationPercent !== null
    )
    .sort((left, right) => right.marketValue - left.marketValue)[0];
  const highestRisk = items
    .filter((item) => item.includeInRisk && item.situation)
    .sort((left, right) => {
      const rightSituation = right.situation;
      const leftSituation = left.situation;

      if (!rightSituation || !leftSituation) {
        return 0;
      }

      return riskRank(rightSituation.riskLevel) - riskRank(leftSituation.riskLevel) ||
        rightSituation.riskScore - leftSituation.riskScore;
    })[0];

  return {
    itemCount: items.length,
    watchedCount: items.filter((item) => item.quantity === 0).length,
    riskIncludedCount: items.filter((item) => item.includeInRisk).length,
    totalMarketValue,
    totalUnrealizedPnl,
    totalUnrealizedPnlPercent: totalUnrealizedPnl !== null && totalCostBasis > 0
      ? (totalUnrealizedPnl / totalCostBasis) * 100
      : null,
    largestHolding: largestHolding
      ? {
        symbol: largestHolding.symbol,
        concentrationPercent: largestHolding.concentrationPercent,
        marketValue: largestHolding.marketValue
      }
      : null,
    highestRisk: highestRisk?.situation
      ? {
        symbol: highestRisk.symbol,
        riskLevel: highestRisk.situation.riskLevel,
        riskScore: highestRisk.situation.riskScore,
        driver: highestRisk.situation.strongestDriver?.label ?? null
      }
      : null,
    updatedAt: new Date().toISOString()
  };
}

function buildNotes(items: PortfolioItemApi[]) {
  const notes: string[] = [];

  const withoutPrice = items.filter((item) => item.currentPrice === null).map((item) => item.symbol);
  if (withoutPrice.length > 0) {
    notes.push(`Missing stored prices for ${Array.from(new Set(withoutPrice)).join(", ")}.`);
  }

  const withoutSituation = items.filter((item) => !item.situation).map((item) => item.symbol);
  if (withoutSituation.length > 0) {
    notes.push(`Run Situation Overview for ${Array.from(new Set(withoutSituation)).join(", ")} to enable risk-driver context.`);
  }

  return notes;
}

export function getPortfolioContext(options: { session: AuthSession; db?: Database.Database }): PortfolioContextApi {
  const user = requireUser(options.session, "analyst");
  const db = ensureDatabase(options.db);
  const storedItems = listPortfolioItems(db, { userId: user.userId });
  const totalMarketValue = storedItems.reduce((sum, item) => {
    if (!item.includeInRisk) {
      return sum;
    }

    const latest = latestPriceForSymbol(db, item.symbol);
    return latest.price === null ? sum : sum + latest.price * item.quantity;
  }, 0);
  const items = storedItems.map((item) => toPortfolioItemApi(db, item, totalMarketValue));

  return {
    items,
    summary: buildSummary(items),
    notes: buildNotes(items)
  };
}

export function createPortfolioItemForSession(options: {
  session: AuthSession;
  input: PortfolioItemInput;
  db?: Database.Database;
}) {
  const user = requireUser(options.session, "analyst");
  const db = ensureDatabase(options.db);
  const id = insertPortfolioItem(db, normalizePortfolioInput(options.input, options.session, user.userId));
  const item = getPortfolioItemById(db, id);

  if (!item) {
    throw new Error("Portfolio item was not created");
  }

  return item;
}

export function updatePortfolioItemForSession(options: {
  session: AuthSession;
  id: number;
  input: Partial<PortfolioItemInput>;
  db?: Database.Database;
}) {
  const user = requireUser(options.session, "analyst");
  const db = ensureDatabase(options.db);
  const current = getPortfolioItemById(db, options.id);

  if (!current || current.userId !== user.userId) {
    throw new ApiInputError("Portfolio item not found", 404);
  }

  const updated = updatePortfolioItem(
    db,
    options.id,
    normalizePortfolioPatch(options.input, current, options.session)
  );

  if (!updated) {
    throw new ApiInputError("Portfolio item not found", 404);
  }

  return updated;
}

export function deletePortfolioItemForSession(options: {
  session: AuthSession;
  id: number;
  db?: Database.Database;
}) {
  const user = requireUser(options.session, "analyst");
  const db = ensureDatabase(options.db);
  const current = getPortfolioItemById(db, options.id);

  if (!current || current.userId !== user.userId) {
    throw new ApiInputError("Portfolio item not found", 404);
  }

  return deletePortfolioItem(db, options.id);
}

export function getPortfolioCalloutForSymbol(options: {
  session: AuthSession;
  symbol: string;
  db?: Database.Database;
}) {
  if (options.session.userId === null) {
    return null;
  }

  const db = ensureDatabase(options.db);
  const item = listPortfolioItems(db, { userId: options.session.userId, symbols: [options.symbol] })[0];

  if (!item) {
    return null;
  }

  const latest = latestPriceForSymbol(db, item.symbol);
  const marketValue = latest.price === null ? null : latest.price * item.quantity;

  return {
    symbol: item.symbol,
    label: item.label,
    quantity: item.quantity,
    averageCost: item.averageCost,
    currentPrice: latest.price,
    marketValue,
    unrealizedPnl: latest.price !== null && item.averageCost !== null
      ? (latest.price - item.averageCost) * item.quantity
      : null,
    includeInRisk: item.includeInRisk,
    isWatchedOnly: item.quantity === 0,
    updatedAt: latest.updatedAt
  };
}
