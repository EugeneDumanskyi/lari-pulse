import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// Below `lg` the sidebar is hidden and the drawer carries the same items, so
// the navigation case runs on every viewport through whichever one the shell
// is showing.
async function navigationFor(page: Page, projectName: string) {
  if (projectName === "chromium-desktop") {
    return page.locator("aside");
  }

  await page.getByRole("button", { name: "Open navigation" }).click();
  return page.getByRole("dialog", { name: "Navigation" });
}

async function clearWatchlist(request: APIRequestContext) {
  const response = await request.get("/api/watchlist");
  const body = (await response.json()) as { data: { items: Array<{ id: number }> } };

  for (const item of body.data.items) {
    await request.delete(`/api/watchlist/${item.id}`);
  }
}

test.beforeEach(async ({ page }) => {
  await clearWatchlist(page.request);
});

test.afterEach(async ({ page }) => {
  await clearWatchlist(page.request);
});

test("a signed-in user adds, notes, reorders and removes a pair", async ({ page }) => {
  await page.goto("/watchlist");
  await expect(page.getByRole("heading", { name: "Watchlist", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No pairs on your watchlist yet" })).toBeVisible();

  await page.locator("#watchlist-symbol").selectOption("BTCUSDT");
  await page.locator("#watchlist-timeframe").selectOption("1h");
  await page.locator("#watchlist-note").fill("Watching the range high");
  await page.getByRole("button", { name: "Add" }).click();

  const rows = page.locator("[id^='watchlist-note-']");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toHaveValue("Watching the range high");

  await page.locator("#watchlist-symbol").selectOption("ETHUSDT");
  await page.locator("#watchlist-timeframe").selectOption("4h");
  await page.locator("#watchlist-note").fill("");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(rows).toHaveCount(2);

  // The new pair lands at the end, then moves to the front.
  await expect(page.getByRole("button", { name: "Move ETH/USDT 4h up" })).toBeEnabled();
  await page.getByRole("button", { name: "Move ETH/USDT 4h up" }).click();
  await expect(page.getByRole("button", { name: "Move ETH/USDT 4h up" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Move BTC/USDT 1h down" })).toBeDisabled();

  await page.getByRole("button", { name: "Remove ETH/USDT 4h" }).click();
  await expect(rows).toHaveCount(1);
  await page.getByRole("button", { name: "Remove BTC/USDT 1h" }).click();
  await expect(page.getByRole("heading", { name: "No pairs on your watchlist yet" })).toBeVisible();
});

test("adding the same pair twice shows the duplicate message on the form", async ({ page }) => {
  await page.goto("/watchlist");
  await page.locator("#watchlist-symbol").selectOption("BTCUSDT");
  await page.locator("#watchlist-timeframe").selectOption("1h");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.locator("[id^='watchlist-note-']")).toHaveCount(1);

  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("BTCUSDT 1h is already on your watchlist.")).toBeVisible();
  await expect(page.locator("[id^='watchlist-note-']")).toHaveCount(1);
});

test("an anonymous visitor is sent to sign in", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();

  await page.goto("/watchlist");
  await expect(page).toHaveURL(/\/login\?next=%2Fwatchlist$/);
  expect((await context.request.get("/api/watchlist")).status()).toBe(401);

  await context.close();
});

test("the navigation item is enabled and navigates for a signed-in viewer", async ({
  page,
  browser,
  baseURL
}, testInfo) => {
  const invite = await page.request.post("/api/admin/invites", { data: { role: "viewer" } });
  expect(invite.status()).toBe(201);
  const invitePath = ((await invite.json()) as { data: { path: string } }).data.path;

  // The new context must inherit the project's viewport, or the shell would
  // show the desktop sidebar on the small projects.
  const context = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
    viewport: testInfo.project.use.viewport
  });
  const viewerPage = await context.newPage();

  await viewerPage.goto(invitePath);
  // The case runs on all three projects in parallel, so the account it creates
  // has to be unique per project.
  await viewerPage.getByLabel("Email").fill(`watchlist-viewer-${testInfo.project.name}@example.com`);
  await viewerPage.getByLabel("Password").fill("member-password-1");
  await viewerPage.getByRole("button", { name: "Create account" }).click();
  await expect(viewerPage).toHaveURL(/\/dashboard$/);

  const navigation = await navigationFor(viewerPage, testInfo.project.name);
  await expect(navigation.getByRole("button", { name: "Portfolio" })).toHaveCount(0);
  await navigation.getByRole("button", { name: "Watchlist" }).click();
  await expect(viewerPage).toHaveURL(/\/watchlist$/);
  await expect(viewerPage.getByRole("heading", { name: "Watchlist", exact: true })).toBeVisible();

  await context.close();
});
