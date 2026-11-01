import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// The first-run tour: steps by role, the menu item it points at, progress and keyboard use. English copy (the config pins the English locale).
test.describe.configure({ mode: "serial" });

async function signIn(page: Page, persona: string) {
  const r = await page.request.post("/api/v1/session", {
    data: { profile_id: persona },
    headers: { "x-forwarded-for": `10.7.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
  });
  expect(r.status()).toBe(200);
}
const nextBtn = (page: Page) => page.getByRole("dialog").getByRole("button", { name: "Next" });

async function openTourFromHelp(page: Page) {
  await page.goto("/help");
  await page.getByRole("button", { name: "Show the quick tour again" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

test("the tour rings the menu item it is talking about, then lets go of it", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("samvaad.tour.v1", "seen"));
  await signIn(page, "demo-mentor-asha");
  await openTourFromHelp(page);
  const ring = page.locator('[data-tour-active="true"]');
  await expect(ring).toHaveCount(0); // step 1 talks about no menu item
  for (let i = 0; i < 4; i++) await nextBtn(page).click();
  await expect(page.getByRole("dialog")).toContainText("Mentor Help");
  await expect(ring).toHaveCount(1);
  await expect(page.locator('[data-tour="/mentor-help"][data-tour-active="true"]').first()).toBeVisible();
  await nextBtn(page).click(); // school check and coaching guide: no menu item
  await expect(ring).toHaveCount(0);
  await nextBtn(page).click(); // works without internet: field mode
  await expect(page.locator('[data-tour="/field"][data-tour-active="true"]').first()).toBeVisible();
  await page.getByRole("button", { name: "Start using SAMVAAD" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(ring).toHaveCount(0); // nothing stays highlighted after the tour
});

test("supervisors see only the four general steps", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("samvaad.tour.v1", "seen"));
  await signIn(page, "demo-supervisor-meena");
  await openTourFromHelp(page);
  await expect(page.getByRole("dialog")).toContainText("Step 1 of 4");
  for (let i = 0; i < 3; i++) await nextBtn(page).click();
  await expect(page.getByRole("dialog")).toContainText("Step 4 of 4");
  await expect(page.getByRole("button", { name: "Start using SAMVAAD" })).toBeVisible();
  const a11y = await new AxeBuilder({ page }).analyze();
  expect(a11y.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
});

test("the left and right arrow keys move between tour steps", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("samvaad.tour.v1", "seen"));
  await signIn(page, "demo-mentor-asha");
  await openTourFromHelp(page);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Step 1 of 7");
  await page.keyboard.press("ArrowRight");
  await expect(dialog).toContainText("Step 2 of 7");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowLeft");
  await expect(dialog).toContainText("Step 2 of 7");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft"); // stays on the first step
  await expect(dialog).toContainText("Step 1 of 7");
});
