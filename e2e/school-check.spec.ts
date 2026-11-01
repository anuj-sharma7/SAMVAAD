import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// School check: one section at a time (children, building, meal, toilets, records, teachers, safety), tap the problems, "something else"
// in own words, and a closing "anything else" note. Asserts English copy (the config pins the English locale cookie).
test.describe.configure({ mode: "serial" });

async function signIn(page: Page) {
  const r = await page.request.post("/api/v1/session", {
    data: { profile_id: "demo-mentor-asha" },
    headers: { "x-forwarded-for": `10.3.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
  });
  expect(r.status()).toBe(200);
}
const next = (page: Page) => page.getByRole("button", { name: "Next" });
const tap = (page: Page, text: string) => page.getByText(text, { exact: true }).click();

test("fill the whole school check by tapping, add own words, save, and see it on the observation page", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("samvaad.tour.v1", "seen"));
  await signIn(page);

  // a visit that is in progress
  const list = await page.request.get("/api/v1/visits?status=planned");
  expect(list.status()).toBe(200);
  const planned = (await list.json()).data?.items?.[0] ?? (await list.json()).items?.[0];
  expect(planned?.id).toBeTruthy();
  const started = await page.request.post(`/api/v1/visits/${planned.id}/transition`, { data: { to: "in_progress" } });
  expect([200, 409]).toContain(started.status());

  await page.goto(`/visits/${planned.id}/observe`);
  await expect(page.getByTestId("school-check-card")).toBeVisible();
  await page.getByRole("link", { name: "Start school check" }).click();
  await expect(page.getByTestId("school-check")).toBeVisible();
  await expect(page.getByTestId("wizard-progress")).toHaveText("Question 1 of 8");

  // 1 learning: a section needs an answer before Next works
  await expect(next(page)).toBeDisabled();
  await tap(page, "Many children cannot read simple words");
  await tap(page, "Children are afraid or shy to speak");
  await expect(next(page)).toBeEnabled();
  await next(page).click();

  // 2 building: "No problem here" is exclusive
  await tap(page, "Roof leaks or is damaged");
  await tap(page, "No problem here");
  await expect(page.getByRole("checkbox", { name: "Roof leaks or is damaged" })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "No problem here" })).toBeChecked();
  await next(page).click();

  // 3 mid-day meal: something else, needs words
  await tap(page, "Meal was served late");
  await tap(page, "Something else (type or speak)");
  await page.getByLabel("Something else you saw (type or speak)").fill("Cook on leave, helper served");
  await next(page).click();

  // 4 toilets, 5 records, 6 teachers, 7 safety
  await tap(page, "No water in the toilet");
  await next(page).click();
  await tap(page, "Attendance register not updated");
  await next(page).click();
  await tap(page, "No problem here");
  await next(page).click();
  await tap(page, "No first-aid box");
  await next(page).click();

  // 8 closing note is optional and shows the count
  await expect(page.getByTestId("wizard-progress")).toHaveText("Question 8 of 8");
  await expect(page.getByTestId("check-summary")).toHaveText("6 problems noted in this check");
  await page.getByLabel("Anything else (type or speak)").fill("School needs a new fan in room 2.");
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  await page.getByRole("button", { name: "Save school check" }).click();

  await expect(page).toHaveURL(new RegExp(`/visits/${planned.id}/observe$`));
  await expect(page.getByTestId("school-check-card")).toContainText("6 problems noted");

  // reopening shows the saved answers
  await page.getByRole("link", { name: "Open school check" }).click();
  await expect(page.getByRole("checkbox", { name: "Many children cannot read simple words" })).toBeChecked();
});
