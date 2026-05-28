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
  isAdmin: true,
  plan: "enterprise",
  username: "admin",
  accessibleSymbols: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "NASDAQ100", "SPX", "DXY", "US10Y", "XAUUSD", "WTI", "VIX"],
  lockedSymbols: [],
  visibleWidgetIds: [
    "trend_strength",
    "multi_timeframe_alignment",
    "momentum_exhaustion",
    "support_resistance_pressure",
    "volume_confirmation",
    "risk_regime",
    "macro_risk_pulse",
    "dollar_pressure",
    "cross_market_divergence",
    "gold_risk_hedge",
    "oil_inflation_pressure"
  ]
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
    isActive: true,
    isLocked: false
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
    isActive: true,
    isLocked: false
  }
];

const marketOverview = {
  symbol: "BTCUSDT",
  timeframe: "1h",
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
    phase2Enabled: false,
    phase2IntervalSeconds: 86_400,
    lastPhase2RunAt: null,
    lastPhase2Status: null
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

const cryptoWidgets = [
  {
    id: 301,
    widgetId: "trend_strength",
    symbol: "BTCUSDT",
    timeframe: "1h",
    score: 87.4,
    direction: "bullish",
    confidence: 0.923,
    severity: "high",
    summary: "BTCUSDT trend is bullish on 1h with price above MA30.",
    details: {
      latestClose: 173.75,
      ma7: 170.1256,
      ma30: 155.4321,
      priceVsMa7Pct: 2.13,
      priceVsMa30Pct: 11.78,
      ma7VsMa30Pct: 9.45,
      structure: "higher_lows"
    },
    sources: [{ source: "binance", type: "ohlcv", symbol: "BTCUSDT", timeframe: "1h", updatedAt: now.toISOString() }],
    updatedAt: now.toISOString()
  },
  {
    id: 302,
    widgetId: "multi_timeframe_alignment",
    symbol: "BTCUSDT",
    timeframe: "1h",
    score: 87.5,
    direction: "bullish_aligned",
    confidence: 0.807,
    severity: "high",
    summary: "BTCUSDT timeframe alignment is bullish aligned across 4 timeframes.",
    details: {
      bullishCount: 3,
      bearishCount: 1,
      totalTimeframes: 4,
      alignmentRatio: 0.75,
      timeframes: {
        "15m": { bias: "bullish", rsi14: 72.44, latestClose: 105.5, ma7: 102.1234, ma30: 98.9876 },
        "1h": { bias: "bullish", rsi14: 69.12, latestClose: 110.25, ma7: 108.12, ma30: 102.34 },
        "4h": { bias: "bullish", rsi14: 64.88, latestClose: 120.75, ma7: 118.12, ma30: 111.98 },
        "1d": { bias: "bearish", rsi14: 38.51, latestClose: 95.5, ma7: 97.23, ma30: 101.77 }
      }
    },
    sources: [{ source: "binance", type: "ohlcv", symbol: "BTCUSDT", timeframe: "1h", updatedAt: now.toISOString() }],
    updatedAt: now.toISOString()
  },
  {
    id: 303,
    widgetId: "momentum_exhaustion",
    symbol: "BTCUSDT",
    timeframe: "1h",
    score: 91.6,
    direction: "bullish_but_overheated",
    confidence: 0.884,
    severity: "high",
    summary: "BTCUSDT momentum reads bullish but overheated with RSI at 84.6.",
    details: {
      rsi14: 84.56,
      ma7: 171.4321,
      ma30: 154.9876,
      distanceFromMa7Pct: 3.27,
      distanceFromMa30Pct: 14.39,
      atr14: 6.7891,
      candleRangeToAtr: 2.35,
      candleStructure: "upper_wick_rejection",
      volumeTrend: "rising"
    },
    sources: [{ source: "binance", type: "ohlcv", symbol: "BTCUSDT", timeframe: "1h", updatedAt: now.toISOString() }],
    updatedAt: now.toISOString()
  },
  {
    id: 304,
    widgetId: "support_resistance_pressure",
    symbol: "BTCUSDT",
    timeframe: "1h",
    score: 83.8,
    direction: "breakout_watch",
    confidence: 0.721,
    severity: "high",
    summary: "BTCUSDT is breakout watch around recent swing zones.",
    details: {
      currentPrice: 120.4,
      nearestSupport: { price: 111.5, touches: 2, distancePct: -7.39 },
      nearestResistance: { price: 121.2, touches: 3, distancePct: 0.66 },
      supportDistancePct: 7.39,
      resistanceDistancePct: 0.66,
      swingSupportCount: 4,
      swingResistanceCount: 5,
      candleStructure: "large_body"
    },
    sources: [{ source: "binance", type: "ohlcv", symbol: "BTCUSDT", timeframe: "1h", updatedAt: now.toISOString() }],
    updatedAt: now.toISOString()
  },
  {
    id: 305,
    widgetId: "volume_confirmation",
    symbol: "BTCUSDT",
    timeframe: "1h",
    score: 70.2,
    direction: "moderate_confirmation",
    confidence: 0.625,
    severity: "high",
    summary: "BTCUSDT volume shows moderate confirmation with a green latest candle.",
    details: {
      candleDirection: "green",
      priceChangePct: 0.42,
      volumeTrend: "rising",
      recentVolumeAverage: 220,
      baselineVolumeAverage: 100,
      volumeRatio: 2.2,
      atr14: 1.7,
      rangeToAtr: 1.24
    },
    sources: [{ source: "binance", type: "ohlcv", symbol: "BTCUSDT", timeframe: "1h", updatedAt: now.toISOString() }],
    updatedAt: now.toISOString()
  }
];

const crossMarketWidgets = [
  {
    id: 401,
    widgetId: "risk_regime",
    symbol: "BTCUSDT",
    timeframe: "1d",
    score: 42.2,
    direction: "unstable",
    confidence: 0.754,
    severity: "high",
    summary: "Broad market regime is unstable with a 42/100 risk score.",
    details: {
      counts: { riskOnCount: 2, riskWeaknessCount: 1, riskOffPressureCount: 2, defensiveBid: true },
      warnings: []
    },
    sources: [{ source: "internal", type: "phase2_widget", timeframe: "1d", updatedAt: now.toISOString() }],
    updatedAt: now.toISOString()
  },
  {
    id: 402,
    widgetId: "macro_risk_pulse",
    symbol: "BTCUSDT",
    timeframe: "1d",
    score: 55.4,
    direction: "unstable",
    confidence: 0.646,
    severity: "high",
    summary: "Macro risk pulse is unstable because cross-market signals are strongly split.",
    details: {
      coverageRatio: 1,
      conflictRatio: 0.411,
      drivers: ["BTC supports risk-on conditions", "DXY adds risk-off pressure", "BTC/DXY correlation is -0.5"],
      correlations: { btcNasdaqLatest: 0.45, btcDxyLatest: -0.5, pairCount: 2 }
    },
    sources: [{ source: "internal", type: "macro_risk_pulse", timeframe: "1d", updatedAt: now.toISOString() }],
    updatedAt: now.toISOString()
  },
  {
    id: 403,
    widgetId: "dollar_pressure",
    symbol: "BTCUSDT",
    timeframe: "1d",
    score: 100,
    direction: "high_dollar_pressure",
    confidence: 0.75,
    severity: "high",
    summary: "Dollar pressure is high dollar pressure with a 100/100 pressure score.",
    details: {
      rawScore: 100,
      correlations: { btcDxyLatest: -0.6, goldDxyLatest: 0.2 },
      drivers: ["DXY is trending higher", "2 of 2 risk assets are bearish", "Gold is not clearly weak", "BTC/DXY correlation is -0.6"]
    },
    sources: [{ source: "internal", type: "phase2_widget", timeframe: "1d", updatedAt: now.toISOString() }],
    updatedAt: now.toISOString()
  },
  {
    id: 404,
    widgetId: "cross_market_divergence",
    symbol: "BTCUSDT",
    timeframe: "1d",
    score: 85,
    direction: "high_divergence",
    confidence: 0.75,
    severity: "high",
    summary: "Cross-market divergence is high divergence with 4 divergence flags.",
    details: {
      structuralDivergences: ["Gold rises despite a stronger dollar", "Oil rises while equities weaken"],
      pairDivergences: [
        { id: "btc_dxy", label: "BTC / DXY", direction: "right_outperforming", spread: -4.25, latestCorrelation: -0.6, observations: 30 },
        { id: "oil_spx", label: "Oil / S&P 500", direction: "left_outperforming", spread: 3.11, latestCorrelation: -0.4, observations: 30 }
      ]
    },
    sources: [{ source: "internal", type: "phase2_widget", timeframe: "1d", updatedAt: now.toISOString() }],
    updatedAt: now.toISOString()
  },
  {
    id: 405,
    widgetId: "gold_risk_hedge",
    symbol: "BTCUSDT",
    timeframe: "1d",
    score: 100,
    direction: "dollar_yield_resilient",
    confidence: 0.75,
    severity: "high",
    summary: "Gold hedge behavior is dollar yield resilient with a 100/100 hedge score.",
    details: {
      drivers: { equitiesWeak: true, pressureRising: true, inflationImpulse: true }
    },
    sources: [{ source: "internal", type: "phase2_widget", timeframe: "1d", updatedAt: now.toISOString() }],
    updatedAt: now.toISOString()
  },
  {
    id: 406,
    widgetId: "oil_inflation_pressure",
    symbol: "BTCUSDT",
    timeframe: "1d",
    score: 100,
    direction: "inflation_pressure",
    confidence: 0.75,
    severity: "high",
    summary: "Oil pressure is inflation pressure with a 100/100 pressure score.",
    details: {
      confirmations: {
        yieldConfirmation: true,
        dollarConfirmation: true,
        equityStress: true,
        hedgeConfirmation: true,
        oilVolatility20Pct: 0.54
      }
    },
    sources: [{ source: "internal", type: "phase2_widget", timeframe: "1d", updatedAt: now.toISOString() }],
    updatedAt: now.toISOString()
  }
];

export async function mockCryptoMacroApis(page: Page) {
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
      return fulfillJson(route, ok({ symbol: "BTCUSDT", timeframe: "1h", results: cryptoWidgets, count: cryptoWidgets.length, message: null }));
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
