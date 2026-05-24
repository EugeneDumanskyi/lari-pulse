import { appConfig } from "@/lib/config/appConfig";
import { widgetRegistry } from "@/lib/widgets/registry";
import type { AuthSession } from "@/lib/auth/access";
import { canAccessSymbol } from "@/lib/auth/access";

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

export function validateWidgetId(widgetId: string) {
  const normalized = widgetId.trim();

  if (!widgetRegistry.get(normalized)) {
    throw new ApiInputError(`Unsupported widgetId: ${widgetId}`);
  }

  return normalized;
}

export function validateSymbolAccess(symbol: string, session: AuthSession) {
  if (!canAccessSymbol(session, symbol)) {
    throw new ApiInputError(`Symbol is locked for the current access level: ${symbol}`);
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
