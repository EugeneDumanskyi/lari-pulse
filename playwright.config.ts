import { defineConfig } from "@playwright/test";
import { adminStorageState } from "./tests/e2e/accounts";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
const databasePath = "test-results/e2e/laripulse-e2e.sqlite";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  expect: {
    timeout: 10_000
  },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "test-results/playwright/reports/html", open: "never" }]
  ],
  outputDir: "test-results/playwright/artifacts",
  use: {
    baseURL,
    browserName: "chromium",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure"
  },
  webServer: {
    // Every run starts from an empty database so the first-run setup flow is exercised.
    command: `node -e "require('fs').rmSync('test-results/e2e', { recursive: true, force: true })" && npx next dev -p ${port}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_PATH: databasePath,
      SCHEDULER_ENABLED: "false",
      MACRO_SCHEDULER_ENABLED: "false",
      LIQUIDITY_RUNTIME_ENABLED: "false",
      LARIPULSE_ADMIN_EMAIL: "",
      LARIPULSE_ADMIN_PASSWORD: ""
    }
  },
  projects: [
    {
      name: "setup",
      testMatch: /first-run\.setup\.ts/
    },
    {
      name: "chromium-mobile",
      dependencies: ["setup"],
      testIgnore: /first-run\.setup\.ts/,
      use: {
        storageState: adminStorageState,
        viewport: { width: 390, height: 844 }
      }
    },
    {
      name: "chromium-tablet",
      dependencies: ["setup"],
      testIgnore: /first-run\.setup\.ts/,
      use: {
        storageState: adminStorageState,
        viewport: { width: 768, height: 1024 }
      }
    },
    {
      name: "chromium-desktop",
      dependencies: ["setup"],
      testIgnore: /first-run\.setup\.ts/,
      use: {
        storageState: adminStorageState,
        viewport: { width: 1440, height: 900 }
      }
    }
  ]
});
