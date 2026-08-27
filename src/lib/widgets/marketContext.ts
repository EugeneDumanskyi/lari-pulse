import type { CorrelationPairResult } from "@/lib/correlations/types";
import type { CandleRecord } from "@/lib/db/types";
import type { MarketRegimeHint, WidgetLiquidityContext, WidgetMarketContext } from "./types";

export interface CryptoMarketContextInput {
  timeframeCandles?: Record<string, CandleRecord[]>;
  liquidity?: WidgetLiquidityContext;
  derivatives?: WidgetMarketContext["derivatives"];
  latestCandleUpdatedAt?: string;
}

export interface CrossMarketContextInput extends CryptoMarketContextInput {
  assetCandles?: Record<string, Record<string, CandleRecord[]>>;
  correlations?: CorrelationPairResult[];
  regimeHints?: MarketRegimeHint[];
  liquidity?: WidgetLiquidityContext;
  metadata?: Record<string, unknown>;
}

export function buildCryptoMarketContext(input: CryptoMarketContextInput): WidgetMarketContext {
  return {
    timeframeCandles: input.timeframeCandles,
    liquidity: input.liquidity,
    derivatives: input.derivatives,
    latestCandleUpdatedAt: input.latestCandleUpdatedAt
  };
}

export function buildCrossMarketContext(input: CrossMarketContextInput): WidgetMarketContext {
  return {
    timeframeCandles: input.timeframeCandles,
    assetCandles: input.assetCandles,
    correlations: input.correlations,
    regimeHints: input.regimeHints,
    liquidity: input.liquidity,
    derivatives: input.derivatives,
    latestCandleUpdatedAt: input.latestCandleUpdatedAt,
    metadata: input.metadata
  };
}

export function getTimeframeCandles(
  marketContext: WidgetMarketContext | undefined,
  timeframe: string
) {
  return marketContext?.timeframeCandles?.[timeframe] ?? [];
}

export function getAssetCandles(
  marketContext: WidgetMarketContext | undefined,
  symbol: string,
  timeframe: string
) {
  return marketContext?.assetCandles?.[symbol]?.[timeframe] ?? [];
}

export function listCorrelationPairs(marketContext: WidgetMarketContext | undefined) {
  return marketContext?.correlations ?? [];
}

export function getCorrelationPair(
  marketContext: WidgetMarketContext | undefined,
  pairId: string
) {
  return listCorrelationPairs(marketContext).find((pair) => pair.id === pairId) ?? null;
}

export function listRegimeHints(marketContext: WidgetMarketContext | undefined) {
  return marketContext?.regimeHints ?? [];
}

export function getLiquidationSummary(
  marketContext: WidgetMarketContext | undefined,
  symbol: string,
  timeframe: string
) {
  return marketContext?.liquidity?.liquidationSummaries?.[symbol]?.[timeframe] ?? null;
}

export function getDerivativesContext(
  marketContext: WidgetMarketContext | undefined,
  symbol: string,
  period: string
) {
  return marketContext?.derivatives?.[symbol]?.[period] ?? null;
}
