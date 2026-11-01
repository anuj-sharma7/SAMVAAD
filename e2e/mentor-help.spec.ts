import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Mentor Help: academic problems with instant AI suggestion and status, class/subject questions with tap-to-answer and AI review,
// and the mid-day meal / ground question sets. English copy (the config pins the English locale cookie).
test.describe.configure({ mode: "serial" });

async function signIn(page: Page) {
  const r = await page.request.post("/api/v1/session", {
    data: { profile_id: "demo-mentor-asha" },
    headers: { "x-forwarded-for": `10.4.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
  });
  expect(r.status()).toBe(200);
}

test("log an academic problem, see the instant suggestion, and change its status", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("samvaad.tour.v1", "seen"));
  await signIn(page);
  await page.goto("/mentor-help");
  await expect(page.getByRole("heading", { name: "Mentor Help", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "Open" }).first().click();
  await expect(page.getByRole("heading", { name: "Academic problems", level: 1 })).toBeVisible();

  await page.getByLabel("What kind of problem?").selectOption("numeracy");
  await page.getByLabel("Class (optional)").selectOption("3");
  await page.getByLabel(/What did you see/).fill("Class 3 children cannot do two digit addition");
  await page.getByRole("button", { name: "Save and get AI suggestion" }).click();
  await expect(page.getByText("Class 3 children cannot do two digit addition")).toBeVisible();
  await expect(page.getByText("First step this week:")).toBeVisible();
  await expect(page.getByText("Simulated AI output").first()).toBeVisible();

  await page.getByRole("button", { name: "Mark resolved" }).first().click();
  await expect(page.getByRole("button", { name: "Reopen" }).first()).toBeVisible();
  const a11y = await new AxeBuilder({ page }).analyze();
  expect(a11y.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
});

test("generate class and subject questions, tap outcomes, get an instant suggestion and an AI review", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("samvaad.tour.v1", "seen"));
  await signIn(page);
  await page.goto("/mentor-help/questions");
  await page.getByLabel("Class", { exact: true }).selectOption("5");
  await page.getByLabel("Subject").selectOption("Mathematics");
  await page.getByRole("button", { name: "Make questions" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Ask the children" }).first()).toBeVisible();
  await expect(page.getByText(/ready-made question bank/)).toBeVisible();

  const firstQuestion = page.getByRole("listitem").filter({ hasText: "Ask the children" }).first();
  await firstQuestion.getByRole("button", { name: "Could not answer" }).click();
  await expect(firstQuestion.getByText("If there is a problem:")).toBeVisible();
  await page.getByRole("button", { name: "Get AI review" }).click();
  await expect(page.getByRole("heading", { name: "AI review" })).toBeVisible();
  await expect(page.getByText("Next step:")).toBeVisible();

  // Sanskrit is not offered in class 1
  await page.getByLabel("Class", { exact: true }).selectOption("1");
  await expect(page.getByLabel("Subject").locator("option", { hasText: "Sanskrit" })).toHaveCount(0);
});

test("mid-day meal and ground question sets work and meet accessibility checks", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("samvaad.tour.v1", "seen"));
  await signIn(page);
  await page.goto("/mentor-help/meal");
  await page.getByLabel("What do you want to check?").selectOption("kitchen");
  await page.getByRole("button", { name: "Make questions" }).click();
  await expect(page.getByText("Ask the cook").first()).toBeVisible();
  await page.getByRole("button", { name: "Problem" }).first().click();
  await expect(page.getByText("If there is a problem:").first()).toBeVisible();

  await page.getByLabel("What do you want to check?").selectOption("toilets");
  await page.getByRole("button", { name: "Make questions" }).click();
  await expect(page.getByText("Ask the children").first()).toBeVisible();
  const a11y = await new AxeBuilder({ page }).analyze();
  expect(a11y.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
});
