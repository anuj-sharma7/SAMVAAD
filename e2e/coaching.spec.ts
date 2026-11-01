import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Coaching guide on the feedback page: live wording check while the mentor edits, and on-demand advice for the conversation.
// English copy (the config pins the English locale cookie).
test.describe.configure({ mode: "serial" });

async function signIn(page: Page) {
  const r = await page.request.post("/api/v1/session", {
    data: { profile_id: "demo-mentor-asha" },
    headers: { "x-forwarded-for": `10.5.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
  });
  expect(r.status()).toBe(200);
}

test("the coaching guide checks the wording live and gives conversation advice without changing the card", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("samvaad.tour.v1", "seen"));
  await signIn(page);

  // Use a visit created just for this test, so the seeded visits that other specs rely on stay untouched.
  const schools = await (await page.request.get("/api/v1/schools")).json();
  const schoolId = (schools.data?.items ?? schools.items)[0].id;
  const created = await page.request.post("/api/v1/visits", {
    data: { school_id: schoolId, teacher_alias: "T-900", scheduled_at: new Date(Date.now() + 86_400_000).toISOString(), grade: 3, subject: "Science", language: "en", purpose: "Routine academic support visit", save_as: "planned" },
    headers: { "idempotency-key": crypto.randomUUID() },
  });
  expect([200, 201]).toContain(created.status());
  const cb = await created.json();
  const planned = cb.data ?? cb;
  expect(planned?.id).toBeTruthy();
  await page.request.post(`/api/v1/visits/${planned.id}/transition`, { data: { to: "in_progress" } });
  const obs = await page.request.post(`/api/v1/visits/${planned.id}/observations`, {
    data: { practice_observed: "Teacher read a story and asked recall questions", evidence: "Children answered in single words when asked what happened." },
    headers: { "idempotency-key": crypto.randomUUID() },
  });
  expect([200, 201]).toContain(obs.status());
  const fb = await page.request.post(`/api/v1/visits/${planned.id}/feedback`, {
    data: { language: "en", use_demo_provider: true },
    headers: { "idempotency-key": crypto.randomUUID() },
  });
  expect([200, 201]).toContain(fb.status());

  await page.goto(`/visits/${planned.id}/feedback`);
  const panel = page.getByRole("heading", { name: "Coaching guide" });
  await expect(panel).toBeVisible();
  await expect(page.getByText("Wording check")).toBeVisible();

  // make the next step vague and long-winded: the check updates at once
  await page.getByLabel(/Agreed next step|next step/i).first().fill("Do group work and then use TLM and also change the seating plan for all of the lessons");
  await expect(page.getByText("Make the next step one small action that fits in one lesson.")).toBeVisible();
  await expect(page.getByText("Add a time to the next step", { exact: false })).toBeVisible();

  // fix it: the same checks turn to "looks fine"
  await page.getByLabel(/Agreed next step|next step/i).first().fill("Ask two why-questions after one story, on two days this week.");
  await expect(page.getByText("The next step is one small action.")).toBeVisible();
  await expect(page.getByText("The next step has a time.")).toBeVisible();

  // conversation advice
  await page.getByRole("button", { name: "Get conversation advice" }).click();
  const advice = page.getByTestId("coach-advice");
  await expect(advice).toBeVisible();
  await expect(advice.getByText("How to start")).toBeVisible();
  await expect(advice.getByText("If the teacher disagrees")).toBeVisible();
  await expect(advice.getByText("How to end")).toBeVisible();
  await expect(advice.getByText("Simulated AI output")).toBeVisible();
  await expect(advice.getByText(/not part of the card/)).toBeVisible();

  // asking for advice did not approve or save anything
  const current = await (await page.request.get(`/api/v1/visits/${planned.id}/feedback`)).json();
  const draft = (current.data ?? current).current;
  expect(draft.status).toBe("draft");

  const a11y = await new AxeBuilder({ page }).analyze();
  expect(a11y.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
});
