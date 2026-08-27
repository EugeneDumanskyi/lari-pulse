import { expect, test as setup } from "@playwright/test";
import { adminStorageState, e2eAdmin } from "./accounts";

setup("a fresh instance sends visitors to first-run setup and creates the admin", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByRole("heading", { name: "Create the admin account" })).toBeVisible();

  await page.getByLabel("Email").fill(e2eAdmin.email);
  await page.getByLabel("Password").fill(e2eAdmin.password);
  await page.getByRole("button", { name: "Create admin and continue" }).click();

  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText("Users & invites")).toBeVisible();

  // Setup is closed once an admin exists; a signed-in admin ends up on the dashboard.
  await page.goto("/setup");
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.context().storageState({ path: adminStorageState });
});
