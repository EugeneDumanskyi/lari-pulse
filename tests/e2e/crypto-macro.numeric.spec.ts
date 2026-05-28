import { expect, test as base, type Page } from "@playwright/test";
import { mockCryptoMacroApis } from "./crypto-macro.fixtures";

const test = base.extend<{ qaGuards: void }>({
  qaGuards: [async ({ page }, use) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const networkErrors: string[] = [];

    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });

    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });

    page.on("requestfailed", (request) => {
      const url = request.url();
      const failure = request.failure()?.errorText ?? "unknown";

      if (url.includes("/api/") && failure !== "net::ERR_ABORTED") {
        networkErrors.push(`${request.method()} ${url} ${failure}`);
      }
    });

    page.on("response", (response) => {
      const url = response.url();

      if (url.includes("/api/") && response.status() >= 500) {
        networkErrors.push(`${response.status()} ${url}`);
      }
    });

    await use();

    await test.info().attach("crypto-macro-error-buckets", {
      contentType: "application/json",
      body: Buffer.from(JSON.stringify({ consoleErrors, pageErrors, networkErrors }, null, 2))
    });

    expect(pageErrors, "Uncaught page errors").toEqual([]);
    expect(consoleErrors, "Unexpected console errors").toEqual([]);
    expect(networkErrors, "Unexpected failed app API requests").toEqual([]);
  }, { auto: true }]
});

test.beforeEach(async ({ page }) => {
  await mockCryptoMacroApis(page);
});

function widgetCard(page: Page, title: string) {
  return page.locator(".scroll-optimized-card").filter({ hasText: title }).first();
}

async function openDetails(card: ReturnType<typeof widgetCard>) {
  await card.getByRole("button", { name: "More details" }).click();
  await expect(card.getByRole("button", { name: "Back" })).toBeVisible();
  await expect(card.getByRole("heading", { name: "Details" })).toBeVisible();
}

test("renders deterministic numeric formatting for crypto widgets", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "LariPulse" })).toBeVisible();

  const trend = widgetCard(page, "Trend Strength");
  await expect(trend.getByText(/^87$/)).toBeVisible();
  await expect(trend.getByText("bullish", { exact: true })).toBeVisible();
  await expect(trend.getByText(/High.*92%/)).toBeVisible();
  await openDetails(trend);
  await expect(trend.getByText("Ma7", { exact: true })).toBeVisible();
  await expect(trend.getByText("170.13", { exact: true })).toBeVisible();
  await expect(trend.getByText("Price Vs Ma30 Pct")).toBeVisible();
  await expect(trend.getByText("11.78", { exact: true })).toBeVisible();
  await trend.getByRole("button", { name: "Back" }).click();

  const mtf = widgetCard(page, "Multi-Timeframe Alignment");
  await expect(mtf.getByText(/^88$/)).toBeVisible();
  await expect(mtf.getByText("bullish aligned", { exact: true })).toBeVisible();
  await expect(mtf.getByText(/High.*81%/)).toBeVisible();
  await openDetails(mtf);
  await expect(mtf.getByText("Alignment Ratio")).toBeVisible();
  await expect(mtf.getByText("0.75", { exact: true })).toBeVisible();
  await expect(mtf.getByText("15m; 1h; 4h; 1d")).toBeVisible();
  await mtf.getByRole("button", { name: "Back" }).click();

  const momentum = widgetCard(page, "Momentum Exhaustion");
  await expect(momentum.getByText(/^92$/)).toBeVisible();
  await expect(momentum.getByText("bullish but overheated", { exact: true })).toBeVisible();
  await expect(momentum.getByText(/High.*88%/)).toBeVisible();
  await openDetails(momentum);
  await expect(momentum.getByText("Atr14")).toBeVisible();
  await expect(momentum.getByText("6.789", { exact: true })).toBeVisible();
  await expect(momentum.getByText("Candle Range To Atr")).toBeVisible();
  await expect(momentum.getByText("2.35", { exact: true })).toBeVisible();
  await momentum.getByRole("button", { name: "Back" }).click();

  const support = widgetCard(page, "Support / Resistance Pressure");
  await expect(support.getByText(/^84$/)).toBeVisible();
  await expect(support.getByText("breakout watch", { exact: true })).toBeVisible();
  await expect(support.getByText(/Medium.*72%/)).toBeVisible();
  await openDetails(support);
  await expect(support.getByText("Nearest Resistance")).toBeVisible();
  await expect(support.getByText(/Price: 121\.20; Touches: 3\.00; Distance Pct: 0\.66/)).toBeVisible();
  await support.getByRole("button", { name: "Back" }).click();

  const volume = widgetCard(page, "Volume Confirmation");
  await expect(volume.getByText(/^70$/)).toBeVisible();
  await expect(volume.getByText("moderate confirmation", { exact: true })).toBeVisible();
  await expect(volume.getByText(/Medium.*63%/)).toBeVisible();
  await openDetails(volume);
  await expect(volume.getByText("Volume Ratio")).toBeVisible();
  await expect(volume.getByText("2.20", { exact: true })).toBeVisible();
  await expect(volume.getByText("Price Change Pct")).toBeVisible();
  await expect(volume.getByText("0.42", { exact: true })).toBeVisible();
});

test("renders deterministic numeric formatting for cross-market widgets", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Macro Context" })).toBeVisible();

  const risk = widgetCard(page, "Risk Regime");
  await expect(risk.getByText(/^42$/)).toBeVisible();
  await expect(risk.getByText("unstable", { exact: true })).toBeVisible();
  await expect(risk.getByText(/High.*75%/)).toBeVisible();
  await openDetails(risk);
  await expect(risk.getByText("Counts")).toBeVisible();
  await expect(risk.getByText(/Risk On Count: 2\.00; Risk Weakness Count: 1\.00; Risk Off Pressure Count: 2\.00/)).toBeVisible();
  await risk.getByRole("button", { name: "Back" }).click();

  const macro = widgetCard(page, "Macro Risk Pulse");
  await expect(macro.getByText(/^55$/)).toBeVisible();
  await expect(macro.getByText("unstable", { exact: true })).toBeVisible();
  await expect(macro.getByText(/Medium.*65%/)).toBeVisible();
  await openDetails(macro);
  await expect(macro.getByText("Conflict Ratio")).toBeVisible();
  await expect(macro.getByText("0.411", { exact: true })).toBeVisible();
  await expect(macro.getByText("Correlations")).toBeVisible();
  await expect(macro.getByText(/Btc Nasdaq Latest: 0\.45; Btc Dxy Latest: -0\.50; Pair Count: 2\.00/)).toBeVisible();
  await macro.getByRole("button", { name: "Back" }).click();

  const dollar = widgetCard(page, "Dollar Pressure");
  await expect(dollar.getByText(/^100$/)).toBeVisible();
  await expect(dollar.getByText("high dollar pressure", { exact: true })).toBeVisible();
  await openDetails(dollar);
  await expect(dollar.getByText("Raw Score")).toBeVisible();
  await expect(dollar.getByText("100.00", { exact: true })).toBeVisible();
  await expect(dollar.getByText(/Btc Dxy Latest: -0\.60; Gold Dxy Latest: 0\.20/)).toBeVisible();
  await dollar.getByRole("button", { name: "Back" }).click();

  const divergence = widgetCard(page, "Cross-Market Divergence");
  await expect(divergence.getByText(/^85$/)).toBeVisible();
  await expect(divergence.getByText("high divergence", { exact: true })).toBeVisible();
  await openDetails(divergence);
  await expect(divergence.getByText("Pair Divergences")).toBeVisible();
  await expect(divergence.getByText("BTC / DXY: right outperforming; Oil / S&P 500: left outperforming")).toBeVisible();
  await divergence.getByRole("button", { name: "Back" }).click();

  const gold = widgetCard(page, "Gold / Risk Hedge");
  await expect(gold.getByText(/^100$/)).toBeVisible();
  await expect(gold.getByText("dollar yield resilient", { exact: true })).toBeVisible();
  await openDetails(gold);
  await expect(gold.getByText("Drivers")).toBeVisible();
  await expect(gold.getByText(/Equities Weak: Yes; Pressure Rising: Yes; Inflation Impulse: Yes/)).toBeVisible();
  await gold.getByRole("button", { name: "Back" }).click();

  const oil = widgetCard(page, "Oil Inflation Pressure");
  await expect(oil.getByText(/^100$/)).toBeVisible();
  await expect(oil.getByText("inflation pressure", { exact: true })).toBeVisible();
  await openDetails(oil);
  await expect(oil.getByText("Confirmations")).toBeVisible();
  await expect(oil.getByText(/Yield Confirmation: Yes; Dollar Confirmation: Yes; Equity Stress: Yes; Hedge Confirmation: Yes/)).toBeVisible();
});
