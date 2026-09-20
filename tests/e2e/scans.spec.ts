import { expect, test, type Page } from "@playwright/test";
import { mockScanApis, scanFixtures } from "./scans.fixtures";

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

async function buildBiasCondition(page: Page) {
  await page.getByRole("button", { name: "Add condition" }).first().click();
  await page.locator("#scan-condition-type-0").selectOption("bias");
  await page.getByRole("button", { name: "strong bullish", exact: true }).click();
}

test("the sidebar item is enabled and navigates to the scans page", async ({ page }, testInfo) => {
  await page.goto("/dashboard");

  const navigation = await navigationFor(page, testInfo.project.name);
  const scans = navigation.getByRole("button", { name: "Scans" });

  await expect(scans).toBeVisible();
  await expect(scans).toBeEnabled();
  await scans.click();

  await expect(page).toHaveURL(/\/scans$/);
  await expect(page.getByRole("heading", { name: "Scans", exact: true })).toBeVisible();
});

test("building a filter returns the matched pairs and the conditions they met", async ({ page }) => {
  await mockScanApis(page, () => "matched");
  await page.goto("/scans");

  await expect(page.getByRole("heading", { name: "No scan has run yet" })).toBeVisible();

  await buildBiasCondition(page);
  await page.getByRole("button", { name: "Run scan" }).click();

  const item = scanFixtures.matchedPayload.items[0];
  await expect(page.getByText(item.title)).toBeVisible();
  await expect(page.getByText(item.matchedConditions[0].label)).toBeVisible();
  await expect(page.getByText(`found ${item.matchedConditions[0].actual}`)).toBeVisible();

  // The pairs without stored state sit alongside the matches, not instead.
  await expect(page.getByTestId("scan-pairs-without-state")).toBeVisible();
  await expect(page.getByText("ETH/USDT 1d")).toBeVisible();
});

test("a filter that matches nothing explains itself with the condition breakdown", async ({ page }) => {
  await mockScanApis(page, () => "empty");
  await page.goto("/scans");

  await buildBiasCondition(page);
  await page.getByRole("button", { name: "Run scan" }).click();

  await expect(page.getByRole("heading", { name: "No pairs matched" })).toBeVisible();

  const breakdown = page.getByTestId("scan-condition-summary");
  await expect(breakdown).toBeVisible();

  // The condition nothing satisfied leads, because it is the one to loosen.
  const rows = page.getByTestId("scan-condition-summary-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("Bias is unknown");
  await expect(rows.first()).toContainText("0 of 8 examined pairs");
});

test("an invalid filter reports inline and leaves the previous results on screen", async ({ page }) => {
  let mode: "matched" | "invalid" = "matched";
  await mockScanApis(page, () => mode);
  await page.goto("/scans");

  await buildBiasCondition(page);
  await page.getByRole("button", { name: "Run scan" }).click();
  await expect(page.getByText(scanFixtures.matchedPayload.items[0].title)).toBeVisible();

  mode = "invalid";
  await page.getByRole("button", { name: "Run scan" }).click();

  await expect(page.getByTestId("scan-filter-error")).toContainText(scanFixtures.invalidFilterMessage);
  await expect(page.getByText(scanFixtures.matchedPayload.items[0].title)).toBeVisible();
});
