import { appConfig } from "@/lib/config/appConfig";
import { collectionTimeframes } from "@/lib/config/timeframes";
import { widgetRegistry } from "@/lib/widgets/registry";
import type { AuthSession } from "@/lib/auth/access";
import { canAccessSymbol, requireRole } from "@/lib/auth/access";

export class ApiInputError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ApiInputError";
    this.statusCode = statusCode;
  }
}

export function requireQueryParam(params: URLSearchParams, name: string) {
  const value = params.get(name);

  if (!value) {
    throw new ApiInputError(`${name} is required`);
  }

  return value;
}

export function validateSymbol(symbol: string) {
  const normalized = symbol.trim().toUpperCase();
  const allowedSymbols = new Set(appConfig.symbols.filter((item) => item.isActive).map((item) => item.symbol));

  if (!allowedSymbols.has(normalized)) {
    throw new ApiInputError(`Unsupported symbol: ${symbol}`);
  }

  return normalized;
}

export function validateOptionalTimeframe(timeframe: string | null) {
  if (!timeframe) {
    return undefined;
  }

  const normalized = timeframe.trim();

  if (!appConfig.timeframes.includes(normalized as (typeof appConfig.timeframes)[number])) {
    throw new ApiInputError(`Unsupported timeframe: ${timeframe}`);
  }

  return normalized;
}

export function validateCollectionTimeframe(timeframe: string) {
  const normalized = timeframe?.trim();

  if (!collectionTimeframes.includes(normalized as (typeof collectionTimeframes)[number])) {
    throw new ApiInputError(`Unsupported timeframe: ${timeframe}`);
  }

  return normalized;
}

export function validateOptionalRange(range: string | null) {
  if (!range) {
    return undefined;
  }

  const normalized = range.trim().toLowerCase();
  const allowedRanges = new Set(["1d", "7d", "30d", "90d"]);

  if (!allowedRanges.has(normalized)) {
    throw new ApiInputError(`Unsupported range: ${range}`);
  }

  return normalized;
}

export function validateWidgetId(widgetId: string) {
  const normalized = widgetId.trim();

  if (!widgetRegistry.get(normalized)) {
    throw new ApiInputError(`Unsupported widgetId: ${widgetId}`);
  }

  return normalized;
}

export function validateSymbolAccess(symbol: string, session: AuthSession) {
  requireRole(session, "viewer");

  if (!canAccessSymbol(session, symbol)) {
    throw new ApiInputError(`Unsupported symbol: ${symbol}`);
  }

  return symbol;
}

export function validateOptionalLimit(limitValue: string | null, defaultLimit = 100, maxLimit = 500) {
  if (!limitValue) {
    return defaultLimit;
  }

  const limit = Number(limitValue);

  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
    throw new ApiInputError(`limit must be an integer from 1 to ${maxLimit}`);
  }

  return limit;
}

export function parseRouteId(value: string, label = "id") {
  const id = Number(value);

  if (!Number.isInteger(id) || id < 1) {
    throw new ApiInputError(`Invalid ${label}`);
  }

  return id;
}

/**
 * Transport-level check for a query parameter carrying JSON. It bounds the
 * string before parsing and asserts nothing about the parsed shape, which is
 * the calling service's job. `URLSearchParams.get` has already decoded the
 * value, so decoding again here would corrupt any value holding a literal `%`.
 */
export function validateJsonQueryParam(value: string | null, name: string, maxLength: number): unknown {
  if (!value) {
    throw new ApiInputError(`${name} is required`);
  }

  if (value.length > maxLength) {
    throw new ApiInputError(`${name} must be at most ${maxLength} characters`);
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new ApiInputError(`${name} is not valid JSON`);
  }
}
