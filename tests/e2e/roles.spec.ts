import { expect, test, type Browser, type BrowserContext } from "@playwright/test";

// These flows change instance state, so they run once (desktop) against the shared e2e database.
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "Role flows run once, on desktop.");
});

async function anonymousContext(browser: Browser, baseURL: string | undefined) {
  return browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
}

async function createInviteLink(adminContext: BrowserContext, role: "viewer" | "analyst" | "admin") {
  const response = await adminContext.request.post("/api/admin/invites", { data: { role } });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { data: { path: string } };
  return body.data.path;
}

async function signUpThroughInvite(browser: Browser, baseURL: string | undefined, invitePath: string, email: string) {
  const context = await anonymousContext(browser, baseURL);
  const page = await context.newPage();

  await page.goto(invitePath);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("member-password-1");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  return { context, page };
}

test("anonymous visitors are sent to sign in and sign-up is invite-only", async ({ browser, baseURL }) => {
  const context = await anonymousContext(browser, baseURL);
  const page = await context.newPage();

  await page.goto("/portfolio");
  await expect(page).toHaveURL(/\/login\?next=%2Fportfolio$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  expect((await context.request.get("/api/widgets/latest?symbol=BTCUSDT")).status()).toBe(401);

  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: "Sign-up is invite-only" })).toBeVisible();

  await page.goto("/login");
  await page.getByLabel("Email").fill("nobody@example.com");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid email or password")).toBeVisible();

  await context.close();
});

test("a viewer joins by invite and gets read-only access", async ({ page, browser, baseURL }) => {
  const invitePath = await createInviteLink(page.context(), "viewer");
  const viewer = await signUpThroughInvite(browser, baseURL, invitePath, "viewer@example.com");
  const sidebar = viewer.page.locator("aside");

  await expect(sidebar.getByRole("button", { name: "Dashboard" })).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "Portfolio" })).toHaveCount(0);
  await expect(sidebar.getByRole("button", { name: "Alerts" })).toHaveCount(0);

  await viewer.page.goto("/portfolio");
  await expect(viewer.page).toHaveURL(/\/dashboard$/);

  expect((await viewer.context.request.post("/api/collect/run")).status()).toBe(403);
  expect((await viewer.context.request.get("/api/portfolio")).status()).toBe(403);
  expect((await viewer.context.request.get("/api/admin/users")).status()).toBe(403);

  // The invite link works once.
  const reuse = await anonymousContext(browser, baseURL);
  const reusePage = await reuse.newPage();
  await reusePage.goto(invitePath);
  await expect(reusePage.getByRole("heading", { name: "This invite link is not valid" })).toBeVisible();

  await reuse.close();
  await viewer.context.close();
});

test("analysts keep private portfolios", async ({ page, browser, baseURL }) => {
  const first = await signUpThroughInvite(browser, baseURL, await createInviteLink(page.context(), "analyst"), "analyst-one@example.com");
  const second = await signUpThroughInvite(browser, baseURL, await createInviteLink(page.context(), "analyst"), "analyst-two@example.com");

  const created = await first.context.request.post("/api/portfolio", { data: { symbol: "BTCUSDT", quantity: 0.25 } });
  expect(created.status()).toBe(201);

  const own = (await (await first.context.request.get("/api/portfolio")).json()) as { data: { items: unknown[] } };
  const other = (await (await second.context.request.get("/api/portfolio")).json()) as { data: { items: unknown[] } };
  expect(own.data.items).toHaveLength(1);
  expect(other.data.items).toHaveLength(0);

  await expect(first.page.locator("aside").getByRole("button", { name: "Portfolio" })).toBeVisible();

  await first.context.close();
  await second.context.close();
});

test("the admin can open a public read-only dashboard", async ({ page, browser, baseURL }) => {
  const visitor = await anonymousContext(browser, baseURL);
  const visitorPage = await visitor.newPage();

  try {
    await page.goto("/settings");
    await page.getByRole("switch", { name: "Public read-only dashboard" }).click();
    await expect(page.getByText("The dashboard is public and read-only.")).toBeVisible();

    await visitorPage.goto("/dashboard");
    await expect(visitorPage).toHaveURL(/\/dashboard$/);
    await expect(visitorPage.getByText("Read-only view")).toBeVisible();
    expect((await visitor.request.post("/api/collect/run")).status()).toBe(401);
    expect((await visitor.request.get("/api/portfolio")).status()).toBe(401);
  } finally {
    const response = await page.context().request.put("/api/admin/settings", { data: { publicDashboard: false } });
    expect(response.ok()).toBeTruthy();
    await visitor.close();
  }

  const closed = await anonymousContext(browser, baseURL);
  const closedPage = await closed.newPage();
  await closedPage.goto("/dashboard");
  await expect(closedPage).toHaveURL(/\/login/);
  await closed.close();
});
