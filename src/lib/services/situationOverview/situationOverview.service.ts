import type Database from "better-sqlite3";
import { filterVisibleWidgetResults, type AuthSession } from "@/lib/auth/access";
import type { WidgetResultApi } from "@/lib/api/types";
import { appConfig } from "@/lib/config/appConfig";
import { getDatabase } from "@/lib/db/client";
import { initializeDatabase } from "@/lib/db/initialize";
import { getCrossMarketWidgets } from "@/lib/services/crossMarketWidgetService";
import { getStoredDashboardMarketOverview } from "@/lib/services/marketDataService";
import { listLatestWidgetResultsWithDerivedLiquidity } from "@/lib/services/widgetResultService";
import { getEffectiveVisibleWidgetIds } from "@/lib/services/widgetSettingsService";
import { widgetCatalog } from "@/lib/widgets/catalog";
import { buildSituationOverview } from "./situationOverview.rules";
import type { SituationOverview } from "./situationOverview.types";

export interface GetSituationOverviewOptions {
  symbol: string;
  timeframe: string;
  session: AuthSession;
  db?: Database.Database;
  now?: Date;
}

const previousOverviewCache = new Map<string, SituationOverview>();

function cacheKey(symbol: string, timeframe: string, session: AuthSession) {
  return `${session.plan}:${symbol}:${timeframe}`;
}

function expectedWidgetIdsForSession(session: AuthSession) {
  const visibleWidgetIds = getEffectiveVisibleWidgetIds(session);
  const visibleSet = new Set(visibleWidgetIds);
  const groupAllowed = (widgetId: string) => {
    const item = widgetCatalog.find((entry) => entry.widgetId === widgetId);

    if (!item) {
      return false;
    }

    if (item.group === "cross_market") {
      return session.isAdmin;
    }

    return true;
  };

  return visibleWidgetIds.filter((id) => visibleSet.has(id) && groupAllowed(id));
}

export async function getSituationOverview(options: GetSituationOverviewOptions): Promise<SituationOverview> {
  if (!options.db) {
    initializeDatabase();
  }

  const db = options.db ?? getDatabase();
  const now = options.now ?? new Date();
  const visibleWidgetIds = getEffectiveVisibleWidgetIds(options.session);
  const expectedWidgetIds = expectedWidgetIdsForSession(options.session);
  const cryptoWidgets = filterVisibleWidgetResults(
    await listLatestWidgetResultsWithDerivedLiquidity(
      {
        symbol: options.symbol,
        timeframe: options.timeframe
      },
      db
    ),
    {
      ...options.session,
      visibleWidgetIds
    }
  );
  let crossMarketWidgets: WidgetResultApi[] = [];

  if (options.session.isAdmin) {
    const crossMarket = await getCrossMarketWidgets({
      timeframe: "1d",
      db,
      visibleWidgetIds
    });
    crossMarketWidgets = crossMarket.results;
  }

  const marketOverview = getStoredDashboardMarketOverview(
    {
      symbol: options.symbol,
      timeframe: options.timeframe,
      limit: 120
    },
    db
  );
  const key = cacheKey(options.symbol, options.timeframe, options.session);
  const previousOverview = previousOverviewCache.get(key) ?? null;
  const overview = buildSituationOverview({
    symbol: options.symbol,
    timeframe: options.timeframe,
    generatedAt: now,
    widgets: cryptoWidgets,
    crossMarketWidgets,
    marketOverview,
    expectedWidgetIds,
    previousOverview
  });

  previousOverviewCache.set(key, overview);

  return overview;
}

export function defaultSituationSymbol() {
  return appConfig.symbols[0]?.symbol ?? "BTCUSDT";
}

export function defaultSituationTimeframe() {
  return appConfig.timeframes.includes("1h" as (typeof appConfig.timeframes)[number]) ? "1h" : appConfig.timeframes[0];
}

export function clearSituationOverviewCache() {
  previousOverviewCache.clear();
}

