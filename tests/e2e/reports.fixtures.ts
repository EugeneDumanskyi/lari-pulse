import type { Page, Route } from "@playwright/test";

/**
 * The first-run E2E database has no widget results and no situation
 * snapshots, so an unmocked page could only ever exercise the no-stored-state
 * path. Each state below needs a payload the suite controls, so
 * `/api/reports` answers from here and everything else falls through.
 */

const generatedAt = "2026-05-26T12:00:00.000Z";

const disclaimer =
  "LariPulse produces analytical summaries of available market data. It is not financial advice, does not give buy or sell instructions, and does not guarantee future performance.";

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

const omittedNote =
  "Portfolio is personal to a signed-in account with the analyst role, so it is not included in this report.";

const document = {
  generatedAt,
  range: "7d",
  window: { from: "2026-05-19T12:00:00.000Z", to: generatedAt },
  scope: {
    symbols: ["BTCUSDT"],
    timeframes: ["1h"],
    pairs: [{ symbol: "BTCUSDT", timeframe: "1h" }]
  },
  disclaimer,
  header: [
    { key: "generated-at", label: "Generated at", value: generatedAt },
    { key: "pairs", label: "Pairs", value: "1" }
  ],
  sections: [
    {
      id: "situation",
      title: "Situation",
      category: "market",
      status: "included",
      note: null,
      entries: [
        {
          scope: { symbol: "BTCUSDT", timeframe: "1h" },
          facts: [
            { key: "bias", label: "Bias", value: "bullish" },
            { key: "risk-level", label: "Risk level", value: "moderate" }
          ]
        }
      ]
    },
    {
      id: "widgets",
      title: "Widgets",
      category: "market",
      status: "empty",
      note: "No widget result is stored for any of the 1 covered pair.",
      entries: []
    },
    {
      id: "portfolio",
      title: "Portfolio",
      category: "personal",
      status: "omitted",
      note: omittedNote,
      entries: []
    }
  ]
};

const markdownBody = `# LariPulse report

${disclaimer}

- Generated at: ${generatedAt}
- Pairs: 1

## Situation

### BTCUSDT 1h

- Bias: bullish
- Risk level: moderate

## Widgets

No widget result is stored for any of the 1 covered pair.

## Portfolio

${omittedNote}
`;

const csvBody =
  "section,scope,key,label,value\r\n" +
  `report,,generated-at,Generated at,${generatedAt}\r\n` +
  "report,,pairs,Pairs,1\r\n" +
  "situation,,status,Status,included\r\n" +
  "situation,BTCUSDT 1h,bias,Bias,bullish\r\n" +
  "situation,BTCUSDT 1h,risk-level,Risk level,moderate\r\n" +
  "widgets,,status,Status,empty\r\n" +
  "widgets,,note,Note,No widget result is stored for any of the 1 covered pair.\r\n" +
  "portfolio,,status,Status,omitted\r\n" +
  `portfolio,,note,Note,"${omittedNote}"\r\n`;

const markdownReport = {
  document,
  format: "markdown",
  body: markdownBody,
  filename: "laripulse-report-BTCUSDT-1h-20260526T120000Z.md",
  contentType: "text/markdown; charset=utf-8"
};

const csvReport = {
  document,
  format: "csv",
  body: csvBody,
  filename: "laripulse-report-BTCUSDT-1h-20260526T120000Z.csv",
  contentType: "text/csv; charset=utf-8"
};

async function fulfillJson(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(data)
  });
}

export type ReportsMode = "markdown" | "csv";

export const reportsFixtures = {
  markdownReport,
  csvReport,
  omittedNote
};

/**
 * `mode` picks which answer `/api/reports` gives, so one page can render a
 * markdown report and then a CSV one without reloading.
 */
export async function mockReportsApis(page: Page, mode: () => ReportsMode) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;

    if (path === "/api/symbols") {
      // The real response carries the session, so it is fetched through and
      // only the symbol list is replaced. A navigation can abort that fetch,
      // and an aborted route must not fail the test.
      try {
        const response = await route.fetch();
        const body = (await response.json()) as { data?: { session?: unknown } };

        return await fulfillJson(route, ok({ symbols, count: symbols.length, session: body.data?.session ?? null }));
      } catch {
        return;
      }
    }

    if (path === "/api/reports") {
      return fulfillJson(route, ok(mode() === "csv" ? csvReport : markdownReport));
    }

    return route.continue();
  });
}
