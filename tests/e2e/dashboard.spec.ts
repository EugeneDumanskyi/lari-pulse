import { expect, test as base, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { mockDashboardApis } from "./dashboard.fixtures";

const routes = [
  { path: "/dashboard", heading: "LariPulse", file: "dashboard" },
  { path: "/markets", heading: "Markets", file: "markets" },
  { path: "/settings", heading: "Settings", file: "settings" }
];

const screenshotDir = path.join(process.cwd(), "test-results/playwright/screenshots/dashboard");

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

    await test.info().attach("dashboard-error-buckets", {
      contentType: "application/json",
      body: Buffer.from(JSON.stringify({ consoleErrors, pageErrors, networkErrors }, null, 2))
    });

    expect(pageErrors, "Uncaught page errors").toEqual([]);
    expect(consoleErrors, "Unexpected console errors").toEqual([]);
    expect(networkErrors, "Unexpected failed app API requests").toEqual([]);
  }, { auto: true }]
});

function viewportName(projectName: string) {
  return projectName.replace(/^chromium-/, "");
}

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth
  }));

  expect(overflow.documentScrollWidth, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.innerWidth + 1);
  expect(overflow.bodyScrollWidth, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.innerWidth + 1);
}

async function capture(page: Page, projectName: string, file: string) {
  mkdirSync(screenshotDir, { recursive: true });
  await page.screenshot({
    fullPage: true,
    path: path.join(screenshotDir, `${file}-${viewportName(projectName)}.png`)
  });
}

test.beforeEach(async ({ page }) => {
  await mockDashboardApis(page);
});

test("app starts and health endpoint responds", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
  await expect(response).toBeOK();
  const body = await response.json();
  expect(body.status).toBe("ok");
  expect(body.app).toBe("laripulse");
});

test("root redirects to dashboard", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "LariPulse" })).toBeVisible();
});

for (const route of routes) {
  test(`${route.path} renders without fatal errors`, async ({ page }, testInfo) => {
    await page.goto(route.path);
    await expect(page.getByRole("heading", { name: route.heading })).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await capture(page, testInfo.project.name, `${route.file}-smoke`);
  });
}

test("dashboard shows key Basic widgets and opens widget details", async ({ page }, testInfo) => {
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "LariPulse" })).toBeVisible();
  await expect(page.getByText("Trend Strength")).toBeVisible();
  await expect(page.getByText("Momentum Exhaustion")).toBeVisible();
  await expect(page.getByText("Widget Results")).toBeVisible();
  await expect(page.getByText("BTC/USDT Price")).toBeVisible();

  await page.getByRole("button", { name: "More details" }).first().click();
  await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Details" })).toBeVisible();

  await assertNoHorizontalOverflow(page);
  await capture(page, testInfo.project.name, "dashboard-widget-details");
});

test("core routes remain responsive with no horizontal overflow", async ({ page }, testInfo) => {
  for (const route of routes) {
    await page.goto(route.path);
    await expect(page.getByRole("heading", { name: route.heading })).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await capture(page, testInfo.project.name, `${route.file}-responsive`);
  }
});
