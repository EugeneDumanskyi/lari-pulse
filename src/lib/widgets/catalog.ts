export type WidgetGroup = "crypto" | "cross_market";
export type WidgetPlanTier = "basic" | "pro" | "enterprise";

export interface WidgetCatalogItem {
  widgetId: string;
  title: string;
  group: WidgetGroup;
  planTier: WidgetPlanTier;
  defaultEnabled: boolean;
  priority: number;
  category: string;
  iconKey: string;
  description: string;
}

export const widgetCatalog = [
  {
    widgetId: "trend_strength",
    title: "Trend Strength",
    group: "crypto",
    planTier: "basic",
    defaultEnabled: true,
    priority: 10,
    category: "trend",
    iconKey: "activity",
    description: "Scores trend quality using moving averages, price structure, and recent candle behavior."
  },
  {
    widgetId: "multi_timeframe_alignment",
    title: "Multi-Timeframe Alignment",
    group: "crypto",
    planTier: "pro",
    defaultEnabled: true,
    priority: 40,
    category: "trend",
    iconKey: "layers",
    description: "Compares directional agreement across configured crypto timeframes."
  },
  {
    widgetId: "liquidations",
    title: "Liquidations",
    group: "crypto",
    planTier: "enterprise",
    defaultEnabled: true,
    priority: 30,
    category: "liquidity",
    iconKey: "zap",
    description: "Summarizes observed Binance forced-order liquidations across longs and shorts for the selected interval."
  },
  {
    widgetId: "derivatives_pressure",
    title: "Derivatives Pressure",
    group: "crypto",
    planTier: "enterprise",
    defaultEnabled: true,
    priority: 35,
    category: "derivatives",
    iconKey: "activity",
    description: "Interprets public Binance futures funding, open interest, long/short ratio, and basis context."
  },
  {
    widgetId: "momentum_exhaustion",
    title: "Momentum Exhaustion",
    group: "crypto",
    planTier: "basic",
    defaultEnabled: true,
    priority: 50,
    category: "momentum",
    iconKey: "gauge",
    description: "Detects when momentum is stretched using RSI, volatility, and distance from moving averages."
  },
  {
    widgetId: "support_resistance_pressure",
    title: "Support / Resistance Pressure",
    group: "crypto",
    planTier: "pro",
    defaultEnabled: true,
    priority: 60,
    category: "levels",
    iconKey: "split",
    description: "Interprets current price pressure against nearby support and resistance zones."
  },
  {
    widgetId: "volume_confirmation",
    title: "Volume Confirmation",
    group: "crypto",
    planTier: "pro",
    defaultEnabled: true,
    priority: 70,
    category: "volume",
    iconKey: "bar-chart",
    description: "Checks whether volume behavior confirms or conflicts with the latest price move."
  },
  {
    widgetId: "risk_regime",
    title: "Risk Regime",
    group: "cross_market",
    planTier: "enterprise",
    defaultEnabled: true,
    priority: 110,
    category: "macro",
    iconKey: "radar",
    description: "Summarizes broad risk-on/risk-off conditions from crypto, equities, dollar, yields, volatility, and commodities."
  },
  {
    widgetId: "macro_risk_pulse",
    title: "Macro Risk Pulse",
    group: "cross_market",
    planTier: "enterprise",
    defaultEnabled: true,
    priority: 120,
    category: "macro",
    iconKey: "pulse",
    description: "Combines BTC, equities, dollar, yields, gold, and oil into a deterministic macro pressure score."
  },
  {
    widgetId: "dollar_pressure",
    title: "Dollar Pressure",
    group: "cross_market",
    planTier: "enterprise",
    defaultEnabled: true,
    priority: 130,
    category: "macro",
    iconKey: "dollar-sign",
    description: "Evaluates whether dollar strength is creating pressure or relief for risk assets."
  },
  {
    widgetId: "nasdaq_crypto_correlation",
    title: "Nasdaq-Crypto Correlation",
    group: "cross_market",
    planTier: "enterprise",
    defaultEnabled: true,
    priority: 140,
    category: "correlation",
    iconKey: "line-chart",
    description: "Tracks whether crypto is moving with or away from Nasdaq-led risk appetite."
  },
  {
    widgetId: "cross_market_divergence",
    title: "Cross-Market Divergence",
    group: "cross_market",
    planTier: "enterprise",
    defaultEnabled: true,
    priority: 150,
    category: "divergence",
    iconKey: "git-compare",
    description: "Highlights material divergences between correlated macro and crypto markets."
  },
  {
    widgetId: "gold_risk_hedge",
    title: "Gold / Risk Hedge",
    group: "cross_market",
    planTier: "enterprise",
    defaultEnabled: true,
    priority: 160,
    category: "macro",
    iconKey: "shield",
    description: "Interprets gold behavior as a hedge signal against dollar, yield, and risk-asset conditions."
  },
  {
    widgetId: "oil_inflation_pressure",
    title: "Oil Inflation Pressure",
    group: "cross_market",
    planTier: "enterprise",
    defaultEnabled: true,
    priority: 170,
    category: "macro",
    iconKey: "flame",
    description: "Reads oil movement as a potential inflation and rates pressure input."
  }
] as const satisfies readonly WidgetCatalogItem[];

const catalogById: Map<string, WidgetCatalogItem> = new Map(widgetCatalog.map((item) => [item.widgetId, item]));

export function getWidgetCatalogItem(widgetId: string) {
  return catalogById.get(widgetId) ?? null;
}

export function isKnownWidgetId(widgetId: string) {
  return catalogById.has(widgetId);
}

export function widgetPriority(widgetId: string) {
  return getWidgetCatalogItem(widgetId)?.priority ?? Number.MAX_SAFE_INTEGER;
}

export function sortByWidgetPriority<T extends { widgetId: string }>(items: T[]) {
  return [...items].sort((left, right) => {
    const priorityDelta = widgetPriority(left.widgetId) - widgetPriority(right.widgetId);

    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return left.widgetId.localeCompare(right.widgetId);
  });
}

export function defaultVisibleWidgetIdsForPlan(plan: WidgetPlanTier | "basic"): string[] {
  if (plan === "basic") {
    return widgetCatalog
      .filter((item) => item.planTier === "basic" && item.defaultEnabled)
      .sort((left, right) => left.priority - right.priority)
      .map((item) => item.widgetId);
  }

  return widgetCatalog
    .filter((item) => item.defaultEnabled)
    .sort((left, right) => left.priority - right.priority)
    .map((item) => item.widgetId);
}
