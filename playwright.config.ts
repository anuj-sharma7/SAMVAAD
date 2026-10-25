import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against a PRODUCTION build (`npm run build` first) on its own port with a throw-away
// database, so they never touch your local demo data.
const PORT = 3200;
const DB = "./data/e2e.db";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1360, height: 900 } } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/v1/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { SAMVAAD_DB_PATH: DB, DEMO_MODE: "true", AI_PROVIDER: "demo" },
  },
});
