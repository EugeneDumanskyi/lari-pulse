import { expect, test, type APIRequestContext } from "@playwright/test";

// The sidebar is hidden below lg and there is no navigation there yet, so the
// cases that go through it run once, on desktop. Everything else navigates to
// /watchlist directly and runs on all three viewports.
const desktopOnly = (name: string) => `${name} — desktop only`;

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

test(desktopOnly("the sidebar item is enabled and navigates for a signed-in viewer"), async ({
  page,
  browser,
  baseURL
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "The sidebar is hidden below lg.");

  const invite = await page.request.post("/api/admin/invites", { data: { role: "viewer" } });
  expect(invite.status()).toBe(201);
  const invitePath = ((await invite.json()) as { data: { path: string } }).data.path;

  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const viewerPage = await context.newPage();

  await viewerPage.goto(invitePath);
  await viewerPage.getByLabel("Email").fill("watchlist-viewer@example.com");
  await viewerPage.getByLabel("Password").fill("member-password-1");
  await viewerPage.getByRole("button", { name: "Create account" }).click();
  await expect(viewerPage).toHaveURL(/\/dashboard$/);

  const sidebar = viewerPage.locator("aside");
  await expect(sidebar.getByRole("button", { name: "Portfolio" })).toHaveCount(0);
  await sidebar.getByRole("button", { name: "Watchlist" }).click();
  await expect(viewerPage).toHaveURL(/\/watchlist$/);
  await expect(viewerPage.getByRole("heading", { name: "Watchlist", exact: true })).toBeVisible();

  await context.close();
});
