import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    // CI cross-region Supabase round-trips make the sign-up → session-check
    // → redirect chain take 30-40s. The default 30s navigationTimeout caused
    // every waitForURL("**/workspaces/new") to time out. 60s gives safe
    // margin without hiding real hangs (tests still have per-test limits).
    navigationTimeout: 60_000,
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
