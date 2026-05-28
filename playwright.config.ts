import { defineConfig } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  expect: {
    timeout: 10_000
  },
  fullyParallel: false,
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
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  },
  projects: [
    {
      name: "chromium-mobile",
      use: {
        viewport: { width: 390, height: 844 }
      }
    },
    {
      name: "chromium-tablet",
      use: {
        viewport: { width: 768, height: 1024 }
      }
    },
    {
      name: "chromium-desktop",
      use: {
        viewport: { width: 1440, height: 900 }
      }
    }
  ]
});
