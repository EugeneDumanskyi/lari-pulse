import { expect, test, type Page } from "@playwright/test";
import { insightsFixtures, mockInsightsApis, type InsightsMode } from "./insights.fixtures";

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

// The navigation case runs unmocked: the first-run database answers
// `/api/insights` with an empty window, which is enough to reach the page.
test("the sidebar item is enabled and navigates to the insights page", async ({ page }, testInfo) => {
  await page.goto("/dashboard");

  const navigation = await navigationFor(page, testInfo.project.name);
  const insights = navigation.getByRole("button", { name: "Insights" });

  await expect(insights).toBeVisible();
  await expect(insights).toBeEnabled();
  await insights.click();

  await expect(page).toHaveURL(/\/insights$/);
  await expect(page.getByRole("heading", { name: "Insights", exact: true })).toBeVisible();
});

test("a reported window renders all eight panels with their coverage badges", async ({ page }) => {
  await mockInsightsApis(page, () => "reported");
  await page.goto("/insights");

  const panels = page.getByTestId("insight-section");
  await expect(panels).toHaveCount(8);

  for (const section of insightsFixtures.reportedPayload.sections) {
    await expect(panels.filter({ hasText: section.title }).first()).toContainText(section.coverage);
  }

  await expect(page.getByTestId("insights-window-header")).toBeVisible();
  await expect(page.getByText("14 situation snapshots cover the requested 7d window.")).toBeVisible();
});

test("changing the range re-issues the request and replaces the sections", async ({ page }) => {
  let mode: InsightsMode = "reported";
  await mockInsightsApis(page, () => mode);
  await page.goto("/insights");

  await expect(page.getByText("14 situation snapshots cover the requested 7d window.")).toBeVisible();

  mode = "insufficient";
  await page.locator("#insights-range").selectOption("30d");

  await expect(page.getByText("2 situation snapshots cover the requested 30d window.")).toBeVisible();
  await expect(page.getByText("14 situation snapshots cover the requested 7d window.")).toHaveCount(0);
});

test("an insufficient window names the count and the shortfall", async ({ page }) => {
  await mockInsightsApis(page, () => "insufficient");
  await page.goto("/insights");

  await expect(page.getByText("2 situation snapshots cover the requested 30d window.")).toBeVisible();
  await expect(
    page.getByText(
      "Only 2 snapshots were stored in this window, fewer than the 3 this feature needs, so the sections below report the shortage rather than a trend."
    )
  ).toBeVisible();
  await expect(
    page.getByText("Only 2 snapshots were stored in this window, fewer than the 3 needed to report bias transitions.")
  ).toBeVisible();
});

test("an empty window points at collection", async ({ page }) => {
  await mockInsightsApis(page, () => "empty");
  await page.goto("/insights");

  await expect(page.getByRole("heading", { name: "Nothing stored in this window" })).toBeVisible();
  await expect(page.getByText("No situation snapshot was stored in the requested 7d window.")).toBeVisible();
  await expect(page.getByTestId("insight-section")).toHaveCount(8);
});

test("alert activity renders its omitted line in place", async ({ page }) => {
  await mockInsightsApis(page, () => "reported");
  await page.goto("/insights");

  const activity = page.getByTestId("insight-section").filter({ hasText: "Alert activity" });

  await expect(activity).toBeVisible();
  await expect(activity).toContainText("omitted");
  await expect(activity).toContainText(
    "Alert activity is personal to a signed-in account with the analyst role, so it is not included in this response."
  );
});
