import { expect, test, type Page } from "@playwright/test";
import { mockReportsApis, reportsFixtures, type ReportsMode } from "./reports.fixtures";

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

// The navigation case runs unmocked: the page renders its initial state
// without generating anything, which is enough to reach it.
test("the sidebar item is enabled and navigates to the reports page", async ({ page }, testInfo) => {
  await page.goto("/dashboard");

  const navigation = await navigationFor(page, testInfo.project.name);
  const reports = navigation.getByRole("button", { name: "Reports" });

  await expect(reports).toBeVisible();
  await expect(reports).toBeEnabled();
  await reports.click();

  await expect(page).toHaveURL(/\/reports$/);
  await expect(page.getByRole("heading", { name: "Reports", exact: true })).toBeVisible();
});

test("generating a report renders the section badges and the preview", async ({ page }) => {
  await mockReportsApis(page, () => "markdown");
  await page.goto("/reports");

  await expect(page.getByRole("heading", { name: "Nothing generated yet" })).toBeVisible();
  await page.getByTestId("reports-generate").click();

  const badges = page.getByTestId("reports-section-badges");
  await expect(badges).toBeVisible();
  await expect(badges.getByTestId("reports-badge-situation")).toContainText("included");
  await expect(badges.getByTestId("reports-badge-widgets")).toContainText("empty");

  // The preview is the file, byte for byte.
  await expect(page.getByTestId("reports-preview")).toHaveText(reportsFixtures.markdownReport.body);
});

test("changing the format re-issues the request and replaces the preview", async ({ page }) => {
  let mode: ReportsMode = "markdown";
  await mockReportsApis(page, () => mode);
  await page.goto("/reports");

  await page.getByTestId("reports-generate").click();
  await expect(page.getByTestId("reports-preview")).toContainText("# LariPulse report");

  mode = "csv";
  await page.locator("#reports-format").selectOption("csv");
  await page.getByTestId("reports-generate").click();

  await expect(page.getByTestId("reports-preview")).toContainText("section,scope,key,label,value");
  await expect(page.getByTestId("reports-preview")).not.toContainText("# LariPulse report");
});

test("an omitted section keeps its badge and its note in place", async ({ page }) => {
  await mockReportsApis(page, () => "markdown");
  await page.goto("/reports");

  await page.getByTestId("reports-generate").click();

  await expect(page.getByTestId("reports-badge-portfolio")).toContainText("omitted");
  await expect(page.getByTestId("reports-preview")).toContainText(reportsFixtures.omittedNote);
});

test("the download control targets the download route with the same query", async ({ page }) => {
  await mockReportsApis(page, () => "markdown");
  await page.goto("/reports");

  const request = page.waitForRequest((candidate) => candidate.url().includes("/api/reports?"));
  await page.getByTestId("reports-generate").click();
  const previewQuery = new URL((await request).url()).search;

  const download = page.getByTestId("reports-download");
  await expect(download).toBeVisible();

  const href = await download.getAttribute("href");

  expect(href).not.toBeNull();

  const downloadUrl = new URL(href ?? "", page.url());

  expect(downloadUrl.pathname).toBe("/api/reports/download");
  expect(downloadUrl.search).toBe(previewQuery);
});
