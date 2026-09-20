import { expect, test, type Page } from "@playwright/test";

/**
 * Below `lg` the sidebar is hidden and the drawer is the only way to move
 * between pages, so these cases run on every viewport and assert the two
 * shapes the shell takes rather than skipping the small ones.
 */
const isDesktop = (projectName: string) => projectName === "chromium-desktop";

async function openNavigation(page: Page) {
  await page.getByRole("button", { name: "Open navigation" }).click();
  return page.getByRole("dialog", { name: "Navigation" });
}

test("the shell offers exactly one navigation for the viewport", async ({ page }, testInfo) => {
  await page.goto("/dashboard");

  const sidebar = page.locator("aside");
  const menuButton = page.getByRole("button", { name: "Open navigation" });

  if (isDesktop(testInfo.project.name)) {
    await expect(sidebar).toBeVisible();
    await expect(menuButton).toBeHidden();
    await expect(sidebar.getByRole("button", { name: "Markets" })).toBeVisible();
    return;
  }

  await expect(sidebar).toBeHidden();
  await expect(menuButton).toBeVisible();

  const drawer = await openNavigation(page);
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Markets" })).toBeVisible();
});

test("the drawer navigates and closes behind itself", async ({ page }, testInfo) => {
  test.skip(isDesktop(testInfo.project.name), "The drawer only exists below lg.");

  await page.goto("/dashboard");

  const drawer = await openNavigation(page);
  await drawer.getByRole("button", { name: "Markets" }).click();

  await expect(page).toHaveURL(/\/markets$/);
  await expect(page.getByRole("dialog", { name: "Navigation" })).toHaveCount(0);
});

test("Escape closes the drawer without navigating", async ({ page }, testInfo) => {
  test.skip(isDesktop(testInfo.project.name), "The drawer only exists below lg.");

  await page.goto("/dashboard");
  await openNavigation(page);

  await page.keyboard.press("Escape");

  await expect(page.getByRole("dialog", { name: "Navigation" })).toHaveCount(0);
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("the dead mock chrome is gone", async ({ page }) => {
  await page.goto("/dashboard");

  // TopBar's placeholder search and SymbolTabs' hardcoded pairs used to ship
  // in the bundle without ever rendering.
  await expect(page.getByText("Search markets...")).toHaveCount(0);
  await expect(page.getByText("Some market data sources are delayed.")).toHaveCount(0);
});

test("form fields render their own background, not the user agent's", async ({ page }) => {
  await page.goto("/watchlist");

  const field = page.locator("#watchlist-note");
  await expect(field).toBeVisible();

  // `bg-slate-950/42` only generates once the opacity scale carries whole
  // percents; without it the field fell back to the UA white behind
  // `text-white`.
  const background = await field.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(background).toBe("rgba(2, 6, 23, 0.42)");
});
