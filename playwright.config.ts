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
  // The app now defaults to Hindi; the existing specs assert English copy, so they pin English with the locale cookie
  // (specs that test the Hindi switch set the cookie themselves through the language toggle).
  use: {
    baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", screenshot: "only-on-failure",
    storageState: { cookies: [{ name: "samvaad_locale", value: "en", domain: "localhost", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" }], origins: [{ origin: `http://localhost:${PORT}`, localStorage: [{ name: "samvaad.welcome.v1", value: "seen" }] }] },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1360, height: 900 } } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/v1/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { SAMVAAD_DB_PATH: DB, DEMO_MODE: "true", AI_PROVIDER: "demo", SAMVAAD_TRUST_PROXY: "true" },
  },
});
