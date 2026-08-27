import type { Page, Route } from "@playwright/test";

const now = new Date("2026-05-26T10:00:00.000Z");

function ok<T>(data: T) {
  return { status: "ok", data };
}

async function fulfillJson(route: Route, data: unknown) {
  await route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(data)
  });
}

function candles(count = 40) {
  const start = now.getTime() - count * 60 * 60 * 1000;

  return Array.from({ length: count }, (_, index) => {
    const openTime = start + index * 60 * 60 * 1000;
    const open = 99_000 + index * 25;
    const close = open + 12.5;

    return {
      openTime,
      closeTime: openTime + 60 * 60 * 1000 - 1,
      open,
      high: close + 70,
      low: open - 80,
      close,
      volume: 1_000 + index * 20
    };
  });
}

const adminSession = {
  userId: 1,
  email: "e2e-admin@example.com",
  role: "admin",
  isAuthenticated: true,
  accessibleSymbols: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "NASDAQ100", "SPX", "DXY", "US10Y", "XAUUSD", "WTI", "VIX"],
  visibleWidgetIds: ["liquidations", "nasdaq_crypto_correlation"]
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
    symbol: "NASDAQ100",
    assetType: "index",
    baseAsset: "NASDAQ100",
    quoteAsset: "USD",
    source: "fred",
    displayName: "Nasdaq 100",
    providerSymbol: "NASDAQ100",
    priceUnit: "index",
    isActive: true
  }
];

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
    latestPrice: 100_012.5,
    previousClose: 99_950,
    change: 62.5,
    changePercent: 0.0625,
    periodHigh: 100_057.25,
    periodLow: 98_940.75,
    periodVolume: 55_500.25,
    candleCount: 40,
    updatedAt: now.toISOString(),
    isStale: false,
    staleReason: null
  }
};

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

const liquidityWidgets = [
  {
    id: 102,
    widgetId: "liquidations",
    symbol: "BTCUSDT",
    timeframe: "1h",
    score: 24.4,
    direction: "long_liquidations_dominant",
    confidence: 0.496,
    severity: "high",
    summary: "BTCUSDT saw more long-liquidation notional, showing downside flush activity in the selected 1h window.",
    details: {
      interval: "1h",
      ageMinutes: 10,
      isStale: false,
      longLiquidationCount: 8,
      shortLiquidationCount: 2,
      longLiquidationUsd: 6_666_666,
      shortLiquidationUsd: 1_111_111,
      totalLiquidationUsd: 7_777_777,
      longNotionalSharePct: 85.7,
      shortNotionalSharePct: 14.3,
      netPressure: "long_liquidations"
    },
    sources: [{ source: "binance_futures", type: "liquidation_events", symbol: "BTCUSDT", timeframe: "1h", updatedAt: "2026-05-26T09:50:00.000Z" }],
    updatedAt: "2026-05-26T09:50:00.000Z"
  }
];

const crossMarketWidgets = [
  {
    id: 201,
    widgetId: "nasdaq_crypto_correlation",
    symbol: "BTCUSDT",
    timeframe: "1d",
    score: 56.56,
    direction: "mixed",
    confidence: 0.754,
    severity: "low",
    summary: "Nasdaq-crypto correlation is mixed with 3 available pair readings.",
    details: {
      averageCorrelation: 0.387,
      assets: {
        BTCUSDT: {
          label: "BTC",
          trend: "bullish",
          latestClose: 65_049,
          ma5: 65_046.2,
          ma20: 65_035.7,
          change5Pct: 0.11,
          volatility20Pct: 0,
          candleCount: 36
        },
        ETHUSDT: {
          label: "ETH",
          trend: "bullish",
          latestClose: 3_049,
          ma5: 3_046.2,
          ma20: 3_035.7,
          change5Pct: 0.23,
          volatility20Pct: 0.01,
          candleCount: 36
        }
      },
      pairs: {
        btc_nasdaq100: {
          label: "BTC / Nasdaq",
          latestCorrelation: 0.612,
          observations: 30,
          divergence: "aligned",
          warnings: []
        },
        eth_nasdaq100: {
          label: "ETH / Nasdaq",
          latestCorrelation: -0.2,
          observations: 30,
          divergence: "left_outperforming",
          warnings: []
        },
        sol_nasdaq100: {
          label: "SOL / Nasdaq",
          latestCorrelation: 0.75,
          observations: 30,
          divergence: "aligned",
          warnings: []
        }
      },
      divergentPairCount: 1,
      warnings: []
    },
    sources: [{ source: "internal", type: "cross_market_widget", symbol: "BTCUSDT", timeframe: "1d", updatedAt: "2026-05-26T00:00:00.000Z" }],
    updatedAt: "2026-05-26T00:00:00.000Z"
  }
];

export async function mockWidgetApis(page: Page) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path === "/api/symbols") {
      return fulfillJson(route, ok({ symbols, count: symbols.length, session: adminSession }));
    }

    if (path === "/api/auth/session") {
      return fulfillJson(route, ok(adminSession));
    }

    if (path === "/api/market/overview" || path === "/api/markets/overview") {
      return fulfillJson(route, ok(marketOverview));
    }

    if (path === "/api/widgets/latest") {
      return fulfillJson(route, ok({ symbol: "BTCUSDT", timeframe: "1h", results: liquidityWidgets, count: liquidityWidgets.length, message: null }));
    }

    if (path === "/api/widgets/cross-market") {
      return fulfillJson(route, ok({
        timeframe: "1d",
        results: crossMarketWidgets,
        assetStatuses: [],
        correlations: [],
        warnings: [],
        updatedAt: now.toISOString()
      }));
    }

    if (path === "/api/runtime/status") {
      return fulfillJson(route, ok(runtimeStatus));
    }

    return route.continue();
  });
}
