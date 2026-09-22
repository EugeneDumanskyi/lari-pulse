import type { Page, Route } from "@playwright/test";

/**
 * The first-run E2E database holds no situation snapshots, so an unmocked page
 * could only ever exercise the empty window. Each state below needs a payload
 * the suite controls, so `/api/insights` answers from here and everything else
 * falls through to the app.
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

const omittedAlertSection = {
  id: "alert-activity",
  title: "Alert activity",
  category: "personal",
  coverage: "omitted",
  lines: [
    {
      id: "alerts-omitted",
      text: "Alert activity is personal to a signed-in account with the analyst role, so it is not included in this response.",
      values: {},
      sourceRows: []
    }
  ]
};

function marketSection(id: string, title: string, coverage: string, lines: Array<{ id: string; text: string }>) {
  return {
    id,
    title,
    category: "market",
    coverage,
    lines: lines.map((line) => ({ ...line, values: {}, sourceRows: [] }))
  };
}

const reportedPayload = {
  symbol: "BTCUSDT",
  timeframe: "1h",
  range: "7d",
  requestedWindow: { from: "2026-05-19T12:00:00.000Z", to: generatedAt },
  coveredWindow: { from: "2026-05-21T08:00:00.000Z", to: "2026-05-26T11:01:12.000Z" },
  snapshotCount: 14,
  truncated: false,
  generatedAt,
  sections: [
    marketSection("window-coverage", "Window coverage", "reported", [
      { id: "window-snapshots", text: "14 situation snapshots cover the requested 7d window." },
      {
        id: "window-span",
        text: "The covered span runs 2026-05-21T08:00:00.000Z to 2026-05-26T11:01:12.000Z, narrower than the requested 7d window."
      },
      { id: "window-gap", text: "The largest gap between consecutive snapshots is 2 days 3 hours." }
    ]),
    marketSection("bias-transitions", "Bias transitions", "reported", [
      {
        id: "bias-transition-824-831",
        text: "Bias moved from bullish to neutral at 2026-05-24T09:30:00.000Z, 2 days 3 hours after the previous snapshot."
      }
    ]),
    marketSection("risk-transitions", "Risk transitions", "reported", [
      { id: "risk-steady", text: "Risk level held at moderate across all 14 snapshots." }
    ]),
    marketSection("recurring-drivers", "Recurring drivers", "reported", [
      { id: "driver-trend_strength", text: "Trend Strength was a main driver in 11 of 14 snapshots, holding bullish." }
    ]),
    marketSection("persistent-conflicts", "Persistent conflicts", "reported", [
      {
        id: "conflict-dollar_pressure",
        text: "Dollar Pressure conflicted with the overall bias in 9 of 14 snapshots, holding risk off."
      }
    ]),
    marketSection("watch-conditions", "Watch conditions", "reported", [
      {
        id: "watch-watch-support-loss",
        text: "Support pressure was raised in 7 of 14 snapshots at warning severity, most recently at 2026-05-26T11:01:12.000Z."
      }
    ]),
    marketSection("data-coverage", "Data coverage", "reported", [
      { id: "coverage-partial", text: "Every snapshot in this window was built from the full expected input set." },
      { id: "coverage-stale", text: "No snapshot reported a stale input." },
      { id: "coverage-missing", text: "No snapshot reported a missing input." },
      { id: "coverage-confidence", text: "Confidence was medium in all 14 snapshots." }
    ]),
    omittedAlertSection
  ]
};

const insufficientPayload = {
  ...reportedPayload,
  range: "30d",
  requestedWindow: { from: "2026-04-26T12:00:00.000Z", to: generatedAt },
  coveredWindow: { from: "2026-05-25T08:00:00.000Z", to: "2026-05-25T09:00:00.000Z" },
  snapshotCount: 2,
  sections: [
    marketSection("window-coverage", "Window coverage", "reported", [
      { id: "window-snapshots", text: "2 situation snapshots cover the requested 30d window." },
      {
        id: "window-insufficient",
        text: "Only 2 snapshots were stored in this window, fewer than the 3 this feature needs, so the sections below report the shortage rather than a trend."
      }
    ]),
    marketSection("bias-transitions", "Bias transitions", "insufficient", [
      {
        id: "bias-insufficient",
        text: "Only 2 snapshots were stored in this window, fewer than the 3 needed to report bias transitions."
      }
    ]),
    marketSection("risk-transitions", "Risk transitions", "insufficient", [
      {
        id: "risk-insufficient",
        text: "Only 2 snapshots were stored in this window, fewer than the 3 needed to report risk level transitions."
      }
    ]),
    marketSection("recurring-drivers", "Recurring drivers", "insufficient", [
      {
        id: "drivers-insufficient",
        text: "Only 2 snapshots were stored in this window, fewer than the 3 needed to report recurring drivers."
      }
    ]),
    marketSection("persistent-conflicts", "Persistent conflicts", "insufficient", [
      {
        id: "conflicts-insufficient",
        text: "Only 2 snapshots were stored in this window, fewer than the 3 needed to report persistent conflicts."
      }
    ]),
    marketSection("watch-conditions", "Watch conditions", "insufficient", [
      {
        id: "watch-insufficient",
        text: "Only 2 snapshots were stored in this window, fewer than the 3 needed to report watch conditions."
      }
    ]),
    marketSection("data-coverage", "Data coverage", "insufficient", [
      {
        id: "coverage-insufficient",
        text: "Only 2 snapshots were stored in this window, fewer than the 3 needed to report data coverage."
      }
    ]),
    omittedAlertSection
  ]
};

/** The six snapshot sections and the subject each names in its empty line. */
const emptySubjects: Array<[string, string, string, string]> = [
  ["bias-transitions", "Bias transitions", "bias", "bias transition"],
  ["risk-transitions", "Risk transitions", "risk", "risk level transition"],
  ["recurring-drivers", "Recurring drivers", "drivers", "recurring driver"],
  ["persistent-conflicts", "Persistent conflicts", "conflicts", "persistent conflict"],
  ["watch-conditions", "Watch conditions", "watch", "watch condition"],
  ["data-coverage", "Data coverage", "coverage", "data coverage"]
];

const emptyPayload = {
  ...reportedPayload,
  coveredWindow: null,
  snapshotCount: 0,
  sections: [
    marketSection("window-coverage", "Window coverage", "reported", [
      { id: "window-snapshots", text: "No situation snapshot was stored in the requested 7d window." }
    ]),
    ...emptySubjects.map(([id, title, linePrefix, subject]) =>
      marketSection(id, title, "empty", [
        {
          id: `${linePrefix}-empty`,
          text: `No situation snapshot was stored in this window, so no ${subject} can be reported.`
        }
      ])
    ),
    omittedAlertSection
  ]
};

async function fulfillJson(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(data)
  });
}

export type InsightsMode = "reported" | "insufficient" | "empty";

export const insightsFixtures = {
  reportedPayload,
  insufficientPayload,
  emptyPayload
};

/**
 * `mode` picks which answer `/api/insights` gives, so one page can read a full
 * window and then a thin one without reloading.
 */
export async function mockInsightsApis(page: Page, mode: () => InsightsMode) {
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

    if (path === "/api/insights") {
      const chosen = mode();

      if (chosen === "insufficient") {
        return fulfillJson(route, ok(insufficientPayload));
      }

      return fulfillJson(route, ok(chosen === "empty" ? emptyPayload : reportedPayload));
    }

    return route.continue();
  });
}
