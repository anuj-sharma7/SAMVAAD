import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Tap-to-answer questions for planning a visit and for recording an observation, plus voice typing.
// Runs after flow.spec.ts against the same throw-away database. Asserts English copy (the config pins the English locale cookie).
test.describe.configure({ mode: "serial" });

async function signIn(page: Page, persona = "demo-mentor-asha") {
  // own client address so the per-client sign-in limit is not shared with other specs
  const r = await page.request.post("/api/v1/session", {
    data: { profile_id: persona },
    headers: { "x-forwarded-for": `10.2.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
  });
  expect(r.status()).toBe(200);
}
const skipTour = (page: Page) => page.addInitScript(() => localStorage.setItem("samvaad.tour.v1", "seen"));
const tap = (page: Page, text: string) => page.getByText(text, { exact: true }).click();
const next = (page: Page) => page.getByRole("button", { name: "Next" });

/** Replaces the browser's speech engine with a fake that "hears" one fixed sentence, so the wiring can be tested without a microphone. */
async function fakeSpeech(page: Page, sentence: string) {
  await page.addInitScript((s) => {
    class FakeRecognition {
      lang = ""; continuous = false; interimResults = false;
      onresult: ((e: unknown) => void) | null = null; onerror: ((e: unknown) => void) | null = null; onend: (() => void) | null = null;
      start() { setTimeout(() => { this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: s }], { isFinal: true })] }); this.onend?.(); }, 30); }
      stop() { this.onend?.(); }
      abort() { /* nothing to cancel */ }
    }
    // current Chromium has both names and the app prefers the unprefixed one, so fake both
    const w = window as unknown as Record<string, unknown>;
    w.SpeechRecognition = FakeRecognition;
    w.webkitSpeechRecognition = FakeRecognition;
  }, sentence);
}

let plannedVisitUrl = "";

test("plan a visit by tapping answers, one question at a time; the full form then opens pre-filled", async ({ page }) => {
  await skipTour(page);
  await signIn(page);
  await page.goto("/visits/new");
  await expect(page.getByTestId("guided-visit")).toBeVisible();
  await expect(page.getByTestId("wizard-progress")).toHaveText("Question 1 of 6");

  // school is required: Next stays off until one is chosen
  await expect(next(page)).toBeDisabled();
  await tap(page, "Lotus Pond Primary School (DEMO-0006)");
  await expect(next(page)).toBeEnabled();
  await next(page).click();

  // teacher code is required
  await expect(page.getByTestId("wizard-progress")).toHaveText("Question 2 of 6");
  await expect(next(page)).toBeDisabled();
  await page.getByLabel("Which teacher? Enter the teacher code.").fill("T-777");
  await next(page).click();

  await tap(page, "Grade 3");
  await next(page).click();
  await tap(page, "Mathematics");
  await next(page).click();
  await expect(page.getByTestId("wizard-progress")).toHaveText("Question 5 of 6");
  await next(page).click(); // purpose keeps its default

  // focus is optional; pick a quick answer
  await expect(page.getByTestId("wizard-progress")).toHaveText("Question 6 of 6");
  await tap(page, "Number concepts");
  await page.getByRole("button", { name: "Check the plan" }).click();

  // the real form opens with every answer filled in
  await expect(page.getByLabel("Teacher alias")).toHaveValue("T-777");
  await expect(page.getByLabel(/^Grade/)).toHaveValue("3");
  await expect(page.getByLabel(/^Subject/)).toHaveValue("Mathematics");
  await expect(page.getByLabel(/^Coaching focus/)).toHaveValue("Number concepts");
  await page.getByRole("button", { name: "Plan visit" }).click();
  await expect(page).toHaveURL(/\/visits\/[0-9a-f-]{36}$/);
  plannedVisitUrl = page.url();
});

test("record an observation by tapping answers; required questions block Next; the form opens pre-filled and saves", async ({ page }) => {
  await skipTour(page);
  await signIn(page);
  await page.goto(plannedVisitUrl);
  await page.getByRole("button", { name: "Start visit" }).click();
  await expect(page).toHaveURL(/\/observe$/);
  await expect(page.getByTestId("guided-observation")).toBeVisible();
  await expect(page.getByTestId("wizard-progress")).toHaveText("Question 1 of 5");

  await expect(next(page)).toBeDisabled();
  await tap(page, "Story reading or read-aloud");
  await next(page).click();

  // evidence: a starter alone is enough to move on, but the box for a real example is always there
  await expect(page.getByTestId("wizard-progress")).toHaveText("Question 2 of 5");
  await expect(next(page)).toBeDisabled();
  await tap(page, "Learners took turns reading aloud");
  await page.getByLabel("Your example (required)").fill("After the story the teacher asked two why-questions.");
  await next(page).click();

  await tap(page, "The teacher asked questions");
  await tap(page, "Learners were given time to answer"); // multiple choice: both stay selected
  await next(page).click();
  await tap(page, "Wait a little longer after asking a question");
  await next(page).click();
  await tap(page, "In pairs");
  await page.getByRole("button", { name: "See my answers" }).click();

  await expect(page.getByLabel("What practice did you observe?")).toHaveValue("Story reading or read-aloud");
  await expect(page.getByLabel(/^Evidence/)).toHaveValue("Learners took turns reading aloud; After the story the teacher asked two why-questions.");
  await expect(page.getByLabel("What worked well")).toHaveValue("The teacher asked questions; Learners were given time to answer");
  await expect(page.getByLabel("One area to grow")).toHaveValue("Wait a little longer after asking a question");
  await expect(page.getByLabel(/^Context/)).toHaveValue("In pairs");
  await page.getByRole("button", { name: "Save observation" }).click();
  await expect(page.getByText("Observation saved").first()).toBeVisible();
});

test("'Something else' reveals a text box; Back keeps earlier answers; the plain form is one tap away", async ({ page }) => {
  await skipTour(page);
  await signIn(page);
  await page.goto(plannedVisitUrl + "/observe");
  await page.getByRole("button", { name: "Add another observation" }).click();
  await expect(page.getByLabel("Something else you saw")).toHaveCount(0);
  await tap(page, "Something else (type or speak)");
  await page.getByLabel("Something else you saw").fill("Choral counting on the verandah");
  await next(page).click();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByLabel("Something else you saw")).toHaveValue("Choral counting on the verandah");
  await page.getByRole("button", { name: "Write it myself instead" }).click();
  await expect(page.getByLabel("What practice did you observe?")).toBeVisible();
});

test("voice typing: the Speak button adds the heard sentence to the text box, and nothing is stored by the app", async ({ page }) => {
  await skipTour(page);
  await fakeSpeech(page, "Learners counted together in tens");
  await signIn(page);
  await page.goto(plannedVisitUrl + "/observe");
  await page.getByRole("button", { name: "Add another observation" }).click();
  await tap(page, "Number or maths activity");
  await next(page).click();
  await page.getByLabel("Your example (required)").fill("Before:");
  await page.getByTestId("voice-btn").click();
  await expect(page.getByLabel("Your example (required)")).toHaveValue("Before: Learners counted together in tens");
  // the sentence lives only in the page; no browser storage holds observation text
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  expect(stored).not.toContain("counted together");
});

test("voice button is simply absent where the browser has no speech recognition, with a clear message", async ({ page }) => {
  await skipTour(page);
  await page.addInitScript(() => { delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition; delete (window as unknown as Record<string, unknown>).SpeechRecognition; });
  await signIn(page);
  await page.goto("/visits/new");
  await expect(page.getByText("Voice typing is not available in this browser. Please type.")).toBeVisible();
  await expect(page.getByTestId("voice-btn")).toHaveCount(0);
});

test("guided screens in English and Hindi: no raw keys and no accessibility violations", async ({ page, context }) => {
  await skipTour(page);
  await signIn(page);
  const scan = async (label: string) => {
    await page.waitForLoadState("networkidle");
    const text = await page.locator("body").innerText();
    expect(text, `${label}: raw i18n keys`).not.toMatch(/\b(common|visits|observe)\.(guided|q|voice)\.[a-zA-Z_.]+/);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(r.violations.map((v) => `${label}: ${v.id} — ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  };
  for (const locale of ["en", "hi"]) {
    await context.addCookies([{ name: "samvaad_locale", value: locale, url: "http://localhost:3200" }]);
    await page.goto("/visits/new");
    await scan(`${locale} visit question 1`);
    await page.getByRole("button", { name: locale === "hi" ? "पूरा फ़ॉर्म खुद भरें" : "Fill the full form instead" }).click();
    await scan(`${locale} visit full form`);
    await page.goto(plannedVisitUrl + "/observe");
    await page.getByRole("button", { name: locale === "hi" ? "एक और ऑब्ज़र्वेशन जोड़ें" : "Add another observation" }).click();
    await scan(`${locale} observation question 1`);
  }
  await expect(page.getByTestId("wizard-progress")).toContainText("सवाल 1 / 5");
});
