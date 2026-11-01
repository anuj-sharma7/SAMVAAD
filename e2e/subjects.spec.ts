import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Plan a visit that covers several subjects, or all of them ("survey all"). English copy (the config pins the English locale cookie).
test.describe.configure({ mode: "serial" });

async function signIn(page: Page) {
  const r = await page.request.post("/api/v1/session", {
    data: { profile_id: "demo-mentor-asha" },
    headers: { "x-forwarded-for": `10.6.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
  });
  expect(r.status()).toBe(200);
}
const tap = (page: Page, text: string) => page.getByText(text, { exact: true }).click();
const next = (page: Page) => page.getByRole("button", { name: "Next" });
// only inside the subject question: "English" is also the name of the interface-language button
const tapSubject = (page: Page, text: string) => page.getByRole("group", { name: "Which subjects will you look at?" }).getByText(text, { exact: true }).click();

async function throughGuidedUntilSubjects(page: Page) {
  await page.addInitScript(() => localStorage.setItem("samvaad.tour.v1", "seen"));
  await signIn(page);
  await page.goto("/visits/new");
  await tap(page, "Lotus Pond Primary School (DEMO-0006)");
  await next(page).click();
  await page.getByLabel("Which teacher? Enter the teacher code.").fill("T-880");
  await next(page).click();
  await tap(page, "Grade 4");
  await next(page).click();
  await expect(page.getByText("Which subjects will you look at?")).toBeVisible();
}

test("tap several subjects: the first is the main subject, the rest are also covered, and it is saved", async ({ page }) => {
  await throughGuidedUntilSubjects(page);
  // Next stays off until at least one subject is chosen
  await expect(next(page)).toBeDisabled();
  await tapSubject(page, "Mathematics");
  await tapSubject(page, "Science");
  await tapSubject(page, "English");
  await expect(next(page)).toBeEnabled();
  await next(page).click();
  await next(page).click(); // purpose keeps its default
  await page.getByRole("button", { name: "Check the plan" }).click();

  // the full form opens with the main subject and the others ticked
  await expect(page.getByLabel(/^Subject/)).toHaveValue("Mathematics");
  const also = page.getByTestId("also-cover");
  await expect(also.getByLabel("Science", { exact: true })).toBeChecked();
  await expect(also.getByLabel("English", { exact: true })).toBeChecked();
  await expect(also.getByLabel("Sanskrit", { exact: true })).not.toBeChecked();
  await expect(also.getByLabel("Mathematics", { exact: true })).toHaveCount(0); // the main subject is not offered again

  await page.getByRole("button", { name: "Plan visit" }).click();
  await expect(page).toHaveURL(/\/visits\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").pop();
  const saved = await (await page.request.get(`/api/v1/visits/${id}`)).json();
  const visit = (saved.data ?? saved).visit ?? (saved.data ?? saved);
  expect(visit.subject).toBe("Mathematics");
  expect(JSON.parse(visit.extra_subjects)).toEqual(["Science", "English"]);
});

test("'All subjects' and 'Survey all subjects' cover every subject", async ({ page }) => {
  await throughGuidedUntilSubjects(page);
  await tapSubject(page, "All subjects (survey all)");
  for (const s of ["Hindi", "English", "Mathematics", "EVS", "Science", "Social Science", "Sanskrit"]) await expect(page.getByLabel(s, { exact: true })).toBeChecked();
  // unticking one subject clears the "all" choice
  await page.getByLabel("Sanskrit", { exact: true }).uncheck({ force: true });
  await expect(page.getByLabel("All subjects (survey all)")).not.toBeChecked();
  await tapSubject(page, "Sanskrit");
  await expect(page.getByLabel("All subjects (survey all)")).toBeChecked();
  await next(page).click();
  await next(page).click();
  await page.getByRole("button", { name: "Check the plan" }).click();

  // the full form: the button toggles between all subjects and only the main one
  const also = page.getByTestId("also-cover");
  await expect(page.getByRole("button", { name: "Only the main subject" })).toBeVisible();
  await expect(also.getByLabel("Sanskrit", { exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Only the main subject" }).click();
  await expect(also.getByLabel("Sanskrit", { exact: true })).not.toBeChecked();
  await page.getByRole("button", { name: "Survey all subjects" }).click();
  await expect(also.getByLabel("Sanskrit", { exact: true })).toBeChecked();
  const a11y = await new AxeBuilder({ page }).analyze();
  expect(a11y.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  await page.getByRole("button", { name: "Plan visit" }).click();
  await expect(page).toHaveURL(/\/visits\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").pop();
  const saved = await (await page.request.get(`/api/v1/visits/${id}`)).json();
  const visit = (saved.data ?? saved).visit ?? (saved.data ?? saved);
  expect(JSON.parse(visit.extra_subjects)).toHaveLength(6);
});
