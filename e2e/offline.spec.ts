import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Real Chromium, real service worker, real IndexedDB, real network switching (context.setOffline) against the production build.
// Runs after flow/i18n specs and before security.spec.ts on the same throw-away database.
test.describe.configure({ mode: "serial" });
const ORIGIN = "http://localhost:3200";
fs.mkdirSync("e2e-screenshots", { recursive: true });

async function signIn(ctx: BrowserContext, persona: string) {
  // Each helper call uses its own client address (the e2e server trusts X-Forwarded-For) so the per-client sign-in limit is not shared across tests.
  const r = await ctx.request.post(`${ORIGIN}/api/v1/session`, { data: { profile_id: persona }, headers: { "x-forwarded-for": `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
  expect(r.status()).toBe(200);
}
const serverVisits = async (ctx: BrowserContext, alias: string) => {
  const r = await ctx.request.get(`${ORIGIN}/api/v1/visits?pageSize=50&q=${alias}`);
  return ((await r.json()).data.items as { id: string; teacher_alias: string }[]).filter((v) => v.teacher_alias === alias);
};
async function openField(page: Page) {
  await page.goto("/field");
  await expect(page.getByTestId("home-start-visit")).toBeVisible({ timeout: 20_000 });
}
/** Wait until the page is controlled by the worker and the shell and its scripts are in the offline cache. */
async function waitUntilOfflineReady(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(async () => !!(await caches.match("/field"))), { timeout: 20_000 }).toBe(true);
  await expect.poll(() => page.evaluate(async () => (await (await caches.open("samvaad-static-v1")).keys()).length), { timeout: 20_000 }).toBeGreaterThan(3);
  await expect(page.getByTestId("last-sync")).not.toContainText(/not synced yet/i, { timeout: 20_000 });
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "samvaad-pw-"));

let userDataDir = "";
let visitUrl = "";

test("MAIN ACCEPTANCE: record a visit, observation and next step with no internet, close the browser, reopen it, still pending; reconnect and sync once with no duplicates", async () => {
  userDataDir = tmp();
  let ctx = await chromium.launchPersistentContext(userDataDir, { baseURL: ORIGIN, viewport: { width: 390, height: 800 } });
  let page = ctx.pages()[0] ?? (await ctx.newPage());
  await signIn(ctx, "demo-mentor-asha");
  await openField(page);
  await waitUntilOfflineReady(page);
  await expect(page.getByTestId("conn-state")).toContainText(/online/i);
  const before = (await serverVisits(ctx, "T-OFF1")).length;
  expect(before).toBe(0);

  // ---- internet lost; the app shell must still load from the service worker cache --------------------------------
  await ctx.setOffline(true);
  await page.reload();
  await expect(page.getByTestId("home-start-visit")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("conn-state")).toContainText(/offline/i, { timeout: 20_000 });

  // ---- record a visit ------------------------------------------------------------------------------------------------
  await page.getByTestId("home-start-visit").click();
  await expect(page.getByTestId("new-visit-form")).toBeVisible();
  await page.locator("#nv-school").selectOption({ index: 1 });
  await page.locator("#nv-alias").fill("T-OFF1");
  await page.getByTestId("visit-submit").click();
  await expect(page.getByTestId("local-save-note")).toContainText(/saved on this device/i);
  await expect(page.getByTestId("visit-sync-badge")).toContainText("Saved on this device — pending sync");
  visitUrl = page.url();
  await page.screenshot({ path: "e2e-screenshots/30-offline-visit-saved.png", fullPage: true });

  // ---- start it, add an observation and a next step ---------------------------------------------------------------
  await page.getByTestId("visit-start").click();
  await page.getByTestId("obs-form").locator("[name=practice_observed]").fill("Learners read the story aloud in pairs.");
  await page.getByTestId("obs-form").locator("[name=evidence]").fill("Few questions checked whether learners understood the story.");
  await page.getByTestId("obs-submit").click();
  await expect(page.getByTestId("obs-item")).toHaveCount(1);
  await expect(page.getByTestId("obs-item")).toContainText(/pending sync/i);
  await page.locator("#c-action").fill("Ask three questions after each read-aloud");
  await page.locator("#c-evidence").fill("Three questions asked after reading");
  await page.getByTestId("commitment-submit").click();
  await expect(page.getByTestId("commitment-item")).toBeVisible();
  await expect(page.getByTestId("commitment-item")).toContainText(/pending sync/i);
  await expect(page.getByTestId("pending-count")).not.toContainText(/all saved/i);

  // nothing reached the server while offline
  await ctx.setOffline(false);
  expect((await serverVisits(ctx, "T-OFF1")).length).toBe(0);
  await ctx.setOffline(true);

  // ---- "restart the app": close the whole browser, reopen the same profile, still offline -------------------------------
  await ctx.close();
  ctx = await chromium.launchPersistentContext(userDataDir, { baseURL: ORIGIN, viewport: { width: 390, height: 800 } });
  await ctx.setOffline(true);
  page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(visitUrl);
  await expect(page.getByTestId("conn-state")).toContainText(/offline/i, { timeout: 20_000 });
  await expect(page.getByTestId("visit-sync-badge")).toContainText("Saved on this device — pending sync");
  await expect(page.getByTestId("obs-item")).toHaveCount(1);
  await expect(page.getByTestId("obs-item")).toContainText("Learners read the story aloud in pairs.");
  await expect(page.getByTestId("commitment-item")).toContainText("Ask three questions");
  await page.screenshot({ path: "e2e-screenshots/31-offline-after-restart.png", fullPage: true });

  // a sync attempt while still offline loses nothing and says so
  await page.getByTestId("sync-now").click();
  await expect(page.getByTestId("visit-sync-badge")).not.toContainText("Synced to server");

  // ---- internet back ----------------------------------------------------------------------------------------------------
  await ctx.setOffline(false);
  await page.getByTestId("sync-now").click();
  await expect(page.getByTestId("visit-sync-badge")).toContainText("Synced to server", { timeout: 20_000 });
  await expect(page.getByTestId("obs-item")).toContainText(/synced/i);
  await expect(page.getByTestId("commitment-item")).toContainText(/synced/i);
  await expect(page.getByTestId("pending-count")).toContainText(/all saved|on the server/i);

  // the server has each record exactly once, and the normal online app can open it
  const onServer = await serverVisits(ctx, "T-OFF1");
  expect(onServer).toHaveLength(1);
  await page.getByTestId("sync-now").click(); // syncing again must not duplicate
  await page.getByTestId("sync-now").click();
  expect(await serverVisits(ctx, "T-OFF1")).toHaveLength(1);
  const obs = await (await ctx.request.get(`${ORIGIN}/api/v1/visits/${onServer[0].id}/observations`)).json();
  expect(obs.data).toHaveLength(1);
  const com = await (await ctx.request.get(`${ORIGIN}/api/v1/commitments`)).json();
  expect((com.data.items ?? com.data).filter((c: { visit_id: string }) => c.visit_id === onServer[0].id)).toHaveLength(1);
  await page.goto(`/visits/${onServer[0].id}`);
  await expect(page.getByText("T-OFF1").first()).toBeVisible();
  await ctx.close();
});

test("the service worker caches only the public shell and static files, never private pages or API responses", async ({ page, context }) => {
  await signIn(context, "demo-mentor-asha");
  await openField(page);
  await waitUntilOfflineReady(page);
  // visit private pages and call the API while the worker is active
  for (const p of ["/dashboard", "/visits", "/schools", "/follow-ups", "/reports"]) { await page.goto(p); await page.waitForLoadState("load"); }
  await page.request.get(`${ORIGIN}/api/v1/visits`);
  await page.request.get(`${ORIGIN}/api/v1/sync/snapshot`);
  await page.goto("/field");
  await page.waitForLoadState("load");
  const cached = await page.evaluate(async () => {
    const out: string[] = [];
    for (const name of await caches.keys()) for (const req of await (await caches.open(name)).keys()) out.push(new URL(req.url).pathname);
    return out;
  });
  expect(cached.length).toBeGreaterThan(3);
  for (const p of cached) {
    expect(p, `unexpected cached URL ${p}`).toMatch(/^\/(field|offline\.html|_next\/static\/.+|icons\/.+)$/);
  }
  expect(cached.some((p) => p.startsWith("/api/"))).toBe(false);
  expect(cached.some((p) => /dashboard|visits|schools|reports|follow-ups|settings/.test(p))).toBe(false);
});

test("offline: a private page shows the offline page that leads to field mode; the manifest is valid", async ({ page, context }) => {
  await signIn(context, "demo-mentor-asha");
  await openField(page);
  await waitUntilOfflineReady(page);
  await context.setOffline(true);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: /You are offline/i })).toBeVisible();
  await page.getByRole("link", { name: /Open field mode/i }).click();
  await expect(page.getByTestId("home-start-visit")).toBeVisible({ timeout: 20_000 });
  await context.setOffline(false);

  const res = await context.request.get(`${ORIGIN}/manifest.webmanifest`);
  expect(res.status()).toBe(200);
  const m = await res.json();
  expect(m.display).toBe("standalone");
  expect(m.start_url).toMatch(/^\/field/);
  expect(m.scope).toBe("/");
  expect(m.name).toBeTruthy();
  const sizes = (m.icons as { sizes: string; purpose?: string; src: string }[]);
  expect(sizes.some((i) => i.sizes === "192x192")).toBe(true);
  expect(sizes.some((i) => i.sizes === "512x512" && i.purpose === "maskable")).toBe(true);
  for (const i of sizes) expect((await context.request.get(ORIGIN + i.src)).status(), i.src).toBe(200);
  expect((await context.request.get(`${ORIGIN}/sw.js`)).headers()["content-type"]).toMatch(/javascript/);
});

test("Hindi in field mode, switched while offline: statuses and forms are in Hindi, no raw keys", async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: ORIGIN, viewport: { width: 360, height: 740 } });
  const page = await ctx.newPage();
  await signIn(ctx, "demo-mentor-asha");
  await openField(page);
  await waitUntilOfflineReady(page);
  await ctx.setOffline(true);
  await page.reload();
  await expect(page.getByTestId("home-start-visit")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "हिन्दी" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
  await page.getByTestId("home-start-visit").click();
  await page.locator("#nv-school").selectOption({ index: 1 });
  await page.locator("#nv-alias").fill("T-OFF2");
  await page.getByTestId("visit-submit").click();
  await expect(page.getByTestId("visit-sync-badge")).toContainText("इस डिवाइस पर सेव है — भेजना बाकी");
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(/\b(common|field|sync|visits|observe)\.[a-zA-Z_.]+\b/);
  expect(text).not.toMatch(/Saved on this device|Start visit/);
  await page.screenshot({ path: "e2e-screenshots/32-field-hindi-offline.png", fullPage: true });
  // no horizontal scrolling at 360px, in Hindi
  const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(w.sw).toBeLessThanOrEqual(w.cw + 1);
  await ctx.setOffline(false);
  await page.getByTestId("sync-now").click();
  await expect(page.getByTestId("visit-sync-badge")).toContainText("सर्वर पर पहुँच गया", { timeout: 20_000 });
  await ctx.close();
});

test("sign-out warns about records that are not sent yet, and keeps them; another account on the same browser sees nothing of them", async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: ORIGIN, viewport: { width: 1200, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem("samvaad.tour.v1", "seen"));
  await signIn(ctx, "demo-mentor-asha");
  await openField(page);
  await waitUntilOfflineReady(page);
  await ctx.setOffline(true);
  await page.getByTestId("home-start-visit").click();
  await page.locator("#nv-school").selectOption({ index: 1 });
  await page.locator("#nv-alias").fill("T-OFF3");
  await page.getByTestId("visit-submit").click();
  await expect(page.getByTestId("visit-sync-badge")).toContainText(/pending sync/i);
  await ctx.setOffline(false);
  // leave field mode WITHOUT syncing (the app would sync on its own; block that for this check)
  await page.route("**/api/v1/sync/push", (r) => r.abort());
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /sign out/i }).first().click();
  const warning = page.getByRole("alertdialog");
  await expect(warning).toBeVisible();
  await expect(warning).toContainText(/not sent yet/i);
  await expect(warning.getByRole("link", { name: /Sync Center/i })).toBeVisible();
  await warning.getByRole("button", { name: /Sign out anyway/i }).click();
  await expect(page).toHaveURL(/\/login/);

  // another account on the same browser: separate local database, sees none of Asha's records
  await signIn(ctx, "demo-mentor-rakesh");
  await page.goto("/field");
  await expect(page.getByTestId("home-start-visit")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("T-OFF3")).toHaveCount(0);
  await expect(page.getByText("T-OFF1")).toHaveCount(0);
  await ctx.request.delete(`${ORIGIN}/api/v1/session`);

  // Asha signs back in: the unsent record is still there and is now sent
  await page.unroute("**/api/v1/sync/push");
  await signIn(ctx, "demo-mentor-asha");
  await page.goto("/field");
  await expect(page.getByText("T-OFF3").first()).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("sync-now").click();
  await expect(page.getByTestId("pending-count")).toContainText(/all saved|on the server/i, { timeout: 20_000 });
  const onServer = await ctx.request.get(`${ORIGIN}/api/v1/visits?pageSize=50&q=T-OFF3`);
  expect(((await onServer.json()).data.items as { teacher_alias: string }[]).filter((v) => v.teacher_alias === "T-OFF3")).toHaveLength(1);
  await ctx.close();
});

test("expired session offline-to-online: records stay, sync resumes after sign-in", async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: ORIGIN, viewport: { width: 390, height: 800 } });
  const page = await ctx.newPage();
  await signIn(ctx, "demo-mentor-asha");
  await openField(page);
  await waitUntilOfflineReady(page);
  await ctx.setOffline(true);
  await page.getByTestId("home-start-visit").click();
  await page.locator("#nv-school").selectOption({ index: 1 });
  await page.locator("#nv-alias").fill("T-OFF4");
  await page.getByTestId("visit-submit").click();
  await expect(page.getByTestId("visit-sync-badge")).toContainText(/pending sync/i);
  await ctx.request.delete(`${ORIGIN}/api/v1/session`).catch(() => undefined); // session ends (server revokes it)
  await ctx.setOffline(false);
  await page.getByTestId("sync-now").click();
  await expect(page.getByTestId("session-banner")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("visit-sync-badge")).toContainText(/pending sync/i); // not lost, not marked failed or synced
  await signIn(ctx, "demo-mentor-asha");
  await page.getByTestId("sync-now").click();
  await expect(page.getByTestId("visit-sync-badge")).toContainText("Synced to server", { timeout: 20_000 });
  await ctx.close();
});

test("Sync Center, accessibility and layout of the field pages (English and Hindi)", async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: ORIGIN, viewport: { width: 360, height: 740 } });
  const page = await ctx.newPage();
  await signIn(ctx, "demo-mentor-asha");
  await openField(page);
  await waitUntilOfflineReady(page);
  const problems: string[] = [];
  const scan = async (label: string) => {
    await page.waitForLoadState("load");
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    for (const v of axe.violations) problems.push(`${label}: axe ${v.id} (${v.impact}) ${v.nodes[0]?.target.join(" ")}`);
    const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    if (w.sw > w.cw + 1) problems.push(`${label}: horizontal overflow ${w.sw}>${w.cw}`);
  };
  const first = await (await ctx.request.get(`${ORIGIN}/api/v1/visits?pageSize=1`)).json();
  const id = first.data.items[0].id as string;
  for (const lang of ["en", "hi"] as const) {
    await page.getByRole("button", { name: lang === "en" ? "English" : "हिन्दी" }).click();
    for (const route of ["/", "/visits/new", `/visit/${id}`, `/visit/${id}/report`, "/cards", "/sync"]) {
      await page.evaluate((r) => { window.location.hash = r; }, route);
      await expect(page.getByRole("main")).toBeVisible();
      await scan(`${lang} #${route.replace(id, ":id")}`);
    }
  }
  await page.getByRole("button", { name: "English" }).click();
  await page.evaluate(() => { window.location.hash = "/sync"; });
  await expect(page.getByTestId("storage-panel")).toBeVisible();
  await expect(page.getByTestId("storage-panel")).toContainText(/not encrypted/i); // the honest statement about local data
  await expect(page.getByTestId("diag-panel")).toBeVisible();
  await page.screenshot({ path: "e2e-screenshots/33-sync-center.png", fullPage: true });
  expect(problems).toEqual([]);
  await ctx.close();
});
