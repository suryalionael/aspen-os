import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  timeout: 90_000, // per-test default; individual long tests override via test.setTimeout
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    navigationTimeout: 60_000, // sign-up+redirect chain takes 35-45s in CI
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
