import { appConfig } from "@/lib/config/appConfig";
import { widgetRegistry } from "@/lib/widgets/registry";

export class ApiInputError extends Error {
  readonly statusCode = 400;
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
