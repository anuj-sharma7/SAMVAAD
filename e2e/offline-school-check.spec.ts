import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The school check in field mode: filled with no internet, kept as "pending", sent once when the connection returns.
test.describe.configure({ mode: "serial" });
const ORIGIN = "http://localhost:3200";

async function signIn(ctx: BrowserContext) {
  await ctx.addCookies([{ name: "samvaad_locale", value: "en", url: ORIGIN, expires: Math.floor(Date.now() / 1000) + 86_400 }]);
  await ctx.addInitScript(() => { try { if (!localStorage.getItem("samvaad.ui-lang")) localStorage.setItem("samvaad.ui-lang", "en"); } catch { /* ignore */ } });
  const r = await ctx.request.post(`${ORIGIN}/api/v1/session`, { data: { profile_id: "demo-mentor-asha" }, headers: { "x-forwarded-for": `10.4.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
  expect(r.status()).toBe(200);
}
async function waitUntilOfflineReady(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(async () => !!(await caches.match("/field"))), { timeout: 20_000 }).toBe(true);
  await expect.poll(() => page.evaluate(async () => (await (await caches.open("samvaad-static-v1")).keys()).length), { timeout: 20_000 }).toBeGreaterThan(3);
  await expect(page.getByTestId("last-sync")).not.toContainText(/not synced yet/i, { timeout: 20_000 });
}
const next = (page: Page) => page.getByTestId("school-check").getByRole("button", { name: "Next", exact: true });
const tap = (page: Page, text: string) => page.getByText(text, { exact: true }).click();

test("fill the school check with no internet, keep it pending, then sync it once", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "samvaad-pw-"));
  const ctx = await chromium.launchPersistentContext(dir, { baseURL: ORIGIN, viewport: { width: 390, height: 800 } });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await signIn(ctx);
  await page.goto("/field");
  await expect(page.getByTestId("home-start-visit")).toBeVisible({ timeout: 20_000 });
  await waitUntilOfflineReady(page);

  await ctx.setOffline(true);
  await page.getByTestId("home-start-visit").click();
  await page.locator("#nv-school").selectOption({ index: 1 });
  await page.locator("#nv-alias").fill("T-OFFSC");
  await page.getByTestId("visit-submit").click();
  await expect(page.getByTestId("local-save-note")).toBeVisible();
  const visitUrl = page.url();
  await page.getByTestId("visit-start").click();

  // not available before the visit is started; now it is
  await expect(page.getByTestId("field-school-check")).toBeVisible();
  await page.getByTestId("school-check-open").click();
  await expect(page.getByTestId("wizard-progress")).toHaveText("Question 1 of 8");
  await tap(page, "Many children cannot read simple words");
  await next(page).click();
  await tap(page, "No problem here");
  await next(page).click();
  await tap(page, "Meal was served late");
  await next(page).click();
  await tap(page, "No water in the toilet");
  await next(page).click();
  await tap(page, "Attendance register not updated");
  await next(page).click();
  await tap(page, "No problem here");
  await next(page).click();
  await tap(page, "No first-aid box");
  await next(page).click();
  await page.getByLabel("Anything else (type or speak)").fill("Needs a new fan in room 2.");
  await expect(page.getByTestId("check-summary")).toHaveText("5 problems noted in this check");
  await page.getByRole("button", { name: "Save school check" }).click();

  await expect(page.getByTestId("school-check-state")).toHaveText("5 problems noted");
  await expect(page.getByTestId("field-school-check")).toContainText(/pending sync/i);

  // restart the app, still offline: the answers are still there
  await ctx.close();
  const ctx2 = await chromium.launchPersistentContext(dir, { baseURL: ORIGIN, viewport: { width: 390, height: 800 } });
  await ctx2.setOffline(true);
  const page2 = ctx2.pages()[0] ?? (await ctx2.newPage());
  await page2.goto(visitUrl);
  await expect(page2.getByTestId("school-check-state")).toHaveText("5 problems noted", { timeout: 20_000 });

  // internet back: syncs once and the server has the check
  await ctx2.setOffline(false);
  await page2.getByTestId("sync-now").click();
  await expect(page2.getByTestId("field-school-check")).toContainText(/synced/i, { timeout: 20_000 });
  const list = await (await ctx2.request.get(`${ORIGIN}/api/v1/visits?pageSize=50&q=T-OFFSC`)).json();
  const id = list.data.items.find((v: { teacher_alias: string }) => v.teacher_alias === "T-OFFSC").id as string;
  const check = await (await ctx2.request.get(`${ORIGIN}/api/v1/visits/${id}/school-check`)).json();
  expect(check.data.answers.meal.ids).toEqual(["lateServed"]);
  expect(check.data.answers.extra.text).toBe("Needs a new fan in room 2.");

  // the local draft report shows the school check too
  await page2.getByTestId("report-link").click();
  const box = page2.getByTestId("school-check-summary");
  await expect(box).toBeVisible();
  await expect(box).toContainText("5 problems noted");
  await expect(box).toContainText("Meal was served late");
  await expect(box).toContainText("Needs a new fan in room 2.");
  await ctx2.close();
});
