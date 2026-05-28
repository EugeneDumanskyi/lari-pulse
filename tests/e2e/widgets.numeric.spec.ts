import { expect, test as base, type Page } from "@playwright/test";
import { mockWidgetApis } from "./widgets.fixtures";

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

    await test.info().attach("widgets-error-buckets", {
      contentType: "application/json",
      body: Buffer.from(JSON.stringify({ consoleErrors, pageErrors, networkErrors }, null, 2))
    });

    expect(pageErrors, "Uncaught page errors").toEqual([]);
    expect(consoleErrors, "Unexpected console errors").toEqual([]);
    expect(networkErrors, "Unexpected failed app API requests").toEqual([]);
  }, { auto: true }]
});

test.beforeEach(async ({ page }) => {
  await mockWidgetApis(page);
});

function widgetCard(page: Page, title: string) {
  return page.locator(".scroll-optimized-card").filter({ hasText: title }).first();
}

async function openDetails(card: ReturnType<typeof widgetCard>) {
  await card.getByRole("button", { name: "More details" }).click();
  await expect(card.getByRole("button", { name: "Back" })).toBeVisible();
  await expect(card.getByRole("heading", { name: "Details" })).toBeVisible();
}

test("renders deterministic Liquidations numeric formatting from mocked API data", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "LariPulse" })).toBeVisible();

  const liquidationsCard = widgetCard(page, "Liquidations");
  await expect(liquidationsCard.getByText(/^24$/)).toBeVisible();
  await expect(liquidationsCard.getByText("long liquidations dominant", { exact: true })).toBeVisible();
  await expect(liquidationsCard.getByText(/Low.*50%/)).toBeVisible();
  await expect(liquidationsCard.getByText("high", { exact: true })).toBeVisible();

  await openDetails(liquidationsCard);
  await expect(liquidationsCard.getByText(/^24$/)).toBeVisible();
  await expect(liquidationsCard.getByText(/^50%$/)).toBeVisible();
  await expect(liquidationsCard.getByText("Long Liquidation Usd")).toBeVisible();
  await expect(liquidationsCard.getByText("6.67M", { exact: true })).toBeVisible();
  await expect(liquidationsCard.getByText("Short Liquidation Usd")).toBeVisible();
  await expect(liquidationsCard.getByText("1.11M", { exact: true })).toBeVisible();
  await expect(liquidationsCard.getByText("Total Liquidation Usd")).toBeVisible();
  await expect(liquidationsCard.getByText("7.78M", { exact: true })).toBeVisible();
  await expect(liquidationsCard.getByText("Net Pressure")).toBeVisible();
  await expect(liquidationsCard.getByText("Long Liquidations")).toBeVisible();
});

test("renders deterministic Nasdaq-Crypto Correlation score, confidence, decimal correlation, and asset percentage formatting", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Macro Context" })).toBeVisible();

  const correlationCard = widgetCard(page, "Nasdaq-Crypto Correlation");
  await expect(correlationCard.getByText(/^57$/)).toBeVisible();
  await expect(correlationCard.getByText("mixed", { exact: true })).toBeVisible();
  await expect(correlationCard.getByText(/High.*75%/)).toBeVisible();

  await openDetails(correlationCard);
  await expect(correlationCard.getByText(/^57$/)).toBeVisible();
  await expect(correlationCard.getByText(/^75%$/)).toBeVisible();
  await expect(correlationCard.getByText("Assets")).toBeVisible();
  await expect(correlationCard.getByText(/BTCUSDT: bullish: 0\.11%; ETHUSDT: bullish: 0\.23%/)).toBeVisible();
  await expect(correlationCard.getByText("Average Correlation")).toBeVisible();
  await expect(correlationCard.getByText("0.387")).toBeVisible();
  await expect(correlationCard.getByText("Divergent Pair Count")).toBeVisible();
  await expect(correlationCard.getByText(/^1.00$/)).toBeVisible();
  await expect(correlationCard.getByText("Pairs")).toBeVisible();
  await expect(correlationCard.getByText("btc_nasdaq100; eth_nasdaq100; sol_nasdaq100")).toBeVisible();
});
