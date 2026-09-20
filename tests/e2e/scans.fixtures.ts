import type { Page, Route } from "@playwright/test";

/**
 * The first-run E2E database holds no widget results, so an unmocked scan
 * could only ever exercise the pairs-without-state path. Each case below needs
 * a payload the suite controls, so `/api/scans/run` answers from here and
 * everything else falls through to the app.
 */

const generatedAt = "2026-05-26T12:00:00.000Z";

function ok<T>(data: T) {
  return { status: "ok", data };
}

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
  }
];

const matchedCondition = {
  id: "c0",
  type: "bias",
  label: "Bias is bullish or strong bullish",
  actual: "bullish"
};

const matchedPayload = {
  items: [
    {
      symbol: "BTCUSDT",
      timeframe: "4h",
      bias: "bullish",
      riskLevel: "moderate",
      confidence: "high",
      score: 61,
      riskScore: 38,
      title: "BTC is bullish with moderate risk",
      summary: "Trend and volume agree while momentum stays contained.",
      matchedConditions: [matchedCondition],
      unmatchedConditions: [],
      updatedAt: generatedAt
    }
  ],
  summary: {
    examinedPairs: 8,
    matchedPairs: 1,
    requestedPairs: 8,
    pairsWithoutState: [{ symbol: "ETHUSDT", timeframe: "1d" }],
    conditionSummary: [{ ...matchedCondition, matchedPairCount: 3 }],
    match: "all",
    generatedAt
  }
};

const emptyPayload = {
  items: [],
  summary: {
    examinedPairs: 8,
    matchedPairs: 0,
    requestedPairs: 8,
    pairsWithoutState: [],
    conditionSummary: [
      { id: "c0", type: "bias", label: "Bias is unknown", matchedPairCount: 0 },
      { id: "c1", type: "confidence", label: "Confidence is high", matchedPairCount: 5 }
    ],
    match: "all",
    generatedAt
  }
};

async function fulfillJson(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(data)
  });
}

export const scanFixtures = {
  matchedPayload,
  emptyPayload,
  invalidFilterMessage: "Unsupported bias value: sideways"
};

/**
 * `mode` picks which answer `/api/scans/run` gives, so one page can run a
 * matching scan and then an invalid one without reloading.
 */
export async function mockScanApis(page: Page, mode: () => "matched" | "empty" | "invalid") {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;

    if (path === "/api/symbols") {
      const response = await route.fetch();
      const body = (await response.json()) as { data?: { session?: unknown } };

      return fulfillJson(route, ok({ symbols, count: symbols.length, session: body.data?.session ?? null }));
    }

    if (path === "/api/scans/run") {
      const chosen = mode();

      if (chosen === "invalid") {
        return fulfillJson(route, { status: "error", message: scanFixtures.invalidFilterMessage }, 400);
      }

      return fulfillJson(route, ok(chosen === "matched" ? matchedPayload : emptyPayload));
    }

    return route.continue();
  });
}
