import type { Page, Route } from "@playwright/test";

const now = new Date("2026-05-26T12:00:00.000Z");

function ok<T>(data: T) {
  return { status: "ok", data };
}

function candles(count = 64) {
  const start = now.getTime() - count * 60 * 60 * 1000;

  return Array.from({ length: count }, (_, index) => {
    const openTime = start + index * 60 * 60 * 1000;
    const open = 67_000 + index * 42;
    const close = open + (index % 5) * 18 - 20;
    const high = Math.max(open, close) + 85;
    const low = Math.min(open, close) - 75;

    return {
      openTime,
      closeTime: openTime + 60 * 60 * 1000 - 1,
      open,
      high,
      low,
      close,
      volume: 1_200 + index * 13
    };
  });
}

const session = {
  userId: 1,
  email: "e2e-admin@example.com",
  role: "admin",
  isAuthenticated: true,
  accessibleSymbols: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "NASDAQ100", "SPX", "DXY", "US10Y", "XAUUSD", "WTI", "VIX"],
  visibleWidgetIds: ["trend_strength", "momentum_exhaustion"]
};

const symbols = [
  {
    symbol: "BTCUSDT",
    assetType: "crypto",
    baseAsset: "BTC",
    quoteAsset: "USDT",
    source: "binance",
    displayName: "Bitcoin",
    providerSymbol: "BTCUSDT",
    priceUnit: "USDT",
    isActive: true
  },
  {
    symbol: "ETHUSDT",
    assetType: "crypto",
    baseAsset: "ETH",
    quoteAsset: "USDT",
    source: "binance",
    displayName: "Ethereum",
    providerSymbol: "ETHUSDT",
    priceUnit: "USDT",
    isActive: true
  },
  {
    symbol: "SOLUSDT",
    assetType: "crypto",
    baseAsset: "SOL",
    quoteAsset: "USDT",
    source: "binance",
    displayName: "Solana",
    providerSymbol: "SOLUSDT",
    priceUnit: "USDT",
    isActive: true
  }
];

const widgetResults = [
  {
    id: 1,
    widgetId: "trend_strength",
    symbol: "BTCUSDT",
    timeframe: "1h",
    score: 72,
    direction: "bullish_trend",
    confidence: 0.78,
    severity: "medium",
    summary: "Trend remains constructive with price above both short and medium moving averages.",
    details: {
      latestClose: 69628,
      ma7: 69412.28,
      ma30: 68720.64,
      priceVsMa30Pct: 1.32,
      structure: "higher_lows"
    },
    sources: [{ source: "binance", type: "candles", symbol: "BTCUSDT", timeframe: "1h", updatedAt: now.toISOString() }],
    updatedAt: now.toISOString()
  },
  {
    id: 2,
    widgetId: "momentum_exhaustion",
    symbol: "BTCUSDT",
    timeframe: "1h",
    score: 61,
    direction: "healthy_momentum",
    confidence: 0.66,
    severity: "low",
    summary: "Momentum is firm without a clear exhaustion signal in the latest candles.",
    details: {
      rsi14: 58.4,
      ma7DistancePct: 0.42,
      ma30DistancePct: 1.29,
      atr14: 184.28
    },
    sources: [{ source: "binance", type: "candles", symbol: "BTCUSDT", timeframe: "1h", updatedAt: now.toISOString() }],
    updatedAt: now.toISOString()
  }
];

const runtimeStatus = {
  scheduler: {
    enabled: false,
    started: false,
    running: false,
    intervalSeconds: 60,
    lastRunAt: null,
    lastStatus: null,
    macroEnabled: false,
    macroIntervalSeconds: 86_400,
    lastMacroRunAt: null,
    lastMacroStatus: null
  },
  liquidity: {
    enabled: false,
    started: false,
    liquidationsRetentionHours: 24,
    latestRetentionPruneAt: null,
    latestRetentionPrunedEvents: null,
    liquidationStream: {
      started: false,
      connected: false,
      reconnecting: false,
      url: "wss://fstream.binance.com/ws/!forceOrder@arr",
      symbols: ["BTCUSDT"],
      messagesReceived: 0,
      eventsReceived: 0,
      eventsStored: 0,
      lastMessageAt: null,
      lastError: null,
      reconnectAttempts: 0,
      sourceRunId: null
    },
    latestLiquidationStreamRun: null
  },
  collection: {
    configuredSymbols: ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
    configuredTimeframes: ["15m", "1h", "4h", "1d"],
    latestBinanceRun: null,
    latestFredRun: null,
    latestSchedulerRun: null,
    recentRuns: [],
    hasCollectorFailure: false,
    warningMessages: []
  }
};

const marketOverview = {
  symbol: "BTCUSDT",
  timeframe: "1h",
  interval: "1h",
  range: "7d",
  source: {
    provider: "sqlite",
    interval: "1h",
    range: "7d",
    isFallback: false,
    warning: null
  },
  candles: candles(),
  metrics: {
    latestPrice: 69628,
    previousClose: 69520,
    change: 108,
    changePercent: 0.16,
    periodHigh: 69950,
    periodLow: 66925,
    periodVolume: 104_820,
    candleCount: 64,
    updatedAt: now.toISOString(),
    isStale: false,
    staleReason: null
  }
};

const markets = [
  {
    symbol: "BTCUSDT",
    displayName: "Bitcoin",
    assetType: "crypto",
    source: "binance",
    group: "Crypto",
    timeframe: "1h",
    priceUnit: "USDT",
    providerSymbol: "BTCUSDT",
    latestValue: 69628,
    changePercent: 0.16,
    candleCount: 64,
    updatedAt: now.toISOString(),
    isStale: false,
    sourceNote: "Binance spot candles stored locally."
  },
  {
    symbol: "ETHUSDT",
    displayName: "Ethereum",
    assetType: "crypto",
    source: "binance",
    group: "Crypto",
    timeframe: "1h",
    priceUnit: "USDT",
    providerSymbol: "ETHUSDT",
    latestValue: null,
    changePercent: null,
    candleCount: 0,
    updatedAt: null,
    isStale: true,
    sourceNote: "No local candles yet."
  },
  {
    symbol: "NASDAQ100",
    displayName: "Nasdaq 100",
    assetType: "index",
    source: "fred",
    group: "Equity / Index",
    timeframe: "1d",
    priceUnit: "index",
    providerSymbol: "NASDAQ100",
    latestValue: null,
    changePercent: null,
    candleCount: 0,
    updatedAt: null,
    isStale: true,
    sourceNote: "No local candles yet."
  }
];

const settingsCatalog = [
  {
    widgetId: "trend_strength",
    title: "Trend Strength",
    group: "crypto",
    defaultEnabled: true,
    priority: 10,
    category: "trend",
    iconKey: "line-chart",
    description: "Measures whether the selected market is trending or mixed.",
    isEnabled: true
  },
  {
    widgetId: "momentum_exhaustion",
    title: "Momentum Exhaustion",
    group: "crypto",
    defaultEnabled: true,
    priority: 20,
    category: "momentum",
    iconKey: "zap",
    description: "Checks whether current momentum is healthy or stretched.",
    isEnabled: true
  },
  {
    widgetId: "macro_risk_pulse",
    title: "Macro Risk Pulse",
    group: "cross_market",
    defaultEnabled: true,
    priority: 110,
    category: "macro",
    iconKey: "globe",
    description: "Combines broad market inputs into a risk pulse.",
    isEnabled: false
  }
];

async function fulfillJson(route: Route, data: unknown) {
  await route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(data)
  });
}

export async function mockDashboardApis(page: Page) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path === "/api/symbols") {
      return fulfillJson(route, ok({ symbols, count: symbols.length, session }));
    }

    if (path === "/api/auth/session") {
      return fulfillJson(route, ok(session));
    }

    if (path === "/api/market/overview" || path === "/api/markets/overview") {
      return fulfillJson(route, ok(marketOverview));
    }

    if (path === "/api/widgets/latest") {
      return fulfillJson(route, ok({ symbol: "BTCUSDT", timeframe: "1h", results: widgetResults, count: widgetResults.length, message: null }));
    }

    if (path === "/api/runtime/status") {
      return fulfillJson(route, ok(runtimeStatus));
    }

    if (path === "/api/markets") {
      return fulfillJson(route, ok({ markets, count: markets.length, session, updatedAt: now.toISOString() }));
    }

    if (path === "/api/settings/widgets") {
      return fulfillJson(route, ok({
        canEdit: true,
        enabledWidgetIds: ["trend_strength", "momentum_exhaustion"],
        catalog: settingsCatalog,
        updatedAt: now.toISOString()
      }));
    }

    if (path === "/api/widgets/cross-market") {
      return fulfillJson(route, ok({
        timeframe: "1d",
        results: [],
        assetStatuses: [],
        correlations: [],
        warnings: [],
        updatedAt: now.toISOString()
      }));
    }

    return route.continue();
  });
}
