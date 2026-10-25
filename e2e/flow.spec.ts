import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";

const SHOTS = "e2e-screenshots";
fs.mkdirSync(SHOTS, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

async function signIn(page: Page, persona: RegExp) {
  await page.goto("/login");
  await page.getByRole("button", { name: persona }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function signOut(page: Page) {
  await page.waitForLoadState("networkidle"); // let React hydrate so the click handler is attached
  await page.getByRole("button", { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/login/);
}

test.describe.configure({ mode: "serial" });
// The first-run tour has its own test (i18n.spec.ts); here it is marked as already seen so it does not cover the page under test.
test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem("samvaad.tour.v1", "seen")); });

test("mentor completes the whole coaching cycle: visit → observation → grounded feedback → approval → demonstration → commitment → follow-up → report", async ({ page }) => {
  // Any console error, CSP violation or uncaught exception during the whole journey fails the test.
  const browserProblems: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") browserProblems.push(`console: ${m.text().slice(0, 200)}`); });
  page.on("pageerror", (e) => browserProblems.push(`pageerror: ${e.message.slice(0, 200)}`));
  // Next aborts in-flight link prefetches (?_rsc=) when the user navigates; that is normal, any other failed request is not.
  page.on("requestfailed", (r) => { if (r.failure()?.errorText !== "net::ERR_ABORTED") browserProblems.push(`requestfailed: ${r.url().slice(0, 120)} ${r.failure()?.errorText}`); });

  await signIn(page, /Asha/);

  // 1 · dashboard is honest about demo data and pilot targets
  await expect(page.getByText("DEMO DATA — FICTIONAL RECORDS")).toBeVisible();
  await expect(page.getByText("Pilot target — not yet measured")).toBeVisible();
  await expect(page.getByText("Not measured yet").first()).toBeVisible();
  await shot(page, "01-dashboard");

  // 2 · school → new visit
  await page.getByRole("link", { name: "Schools", exact: true }).click();
  await shot(page, "02-schools");
  await page.getByRole("link", { name: "Kesar Vihar Primary School" }).click();
  await expect(page.getByRole("heading", { name: "Kesar Vihar Primary School" })).toBeVisible();
  await expect(page.getByText("Open coaching commitments")).toBeVisible();
  await page.getByRole("link", { name: /New visit here/ }).click();

  // 3 · plan: the earlier commitment surfaces automatically
  await page.getByLabel("Teacher alias").fill("T-101");
  await expect(page.getByText("Follow up on the previous commitment")).toBeVisible();
  await expect(page.getByText("Overdue").first()).toBeVisible();
  await page.getByLabel(/^Grade/).selectOption("2");
  await page.getByLabel(/^Subject/).selectOption("Hindi");
  await page.getByLabel("Coaching language").selectOption("en");
  await shot(page, "03-plan-visit");
  await page.getByRole("button", { name: "Plan visit" }).click();
  await expect(page).toHaveURL(/\/visits\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Planned").first()).toBeVisible();
  const visitUrl = page.url();

  // 4 · start, record the follow-up on the previous commitment
  await page.getByRole("button", { name: "Start visit" }).click();
  await expect(page).toHaveURL(/\/observe$/);
  await page.goto(visitUrl);
  await page.getByRole("button", { name: "Record what happened" }).click();
  const dialog = page.getByRole("dialog", { name: "Record what happened" });
  await dialog.getByLabel("Was it attempted?").selectOption("tried_needs_support");
  await dialog.getByLabel("Evidence you observed").fill("Asked two why-questions after one story.");
  await dialog.getByLabel("Barriers or support needed").fill("Unsure what to ask for longer texts.");
  await dialog.getByRole("button", { name: "Save follow-up" }).click();
  await expect(page.getByText("Tried, needs more support").first()).toBeVisible();

  // 5 · observe: structured observation, suggested tag needs confirmation
  await page.getByRole("link", { name: "Observe", exact: true }).first().click();
  await page.getByLabel("What practice did you observe?").fill("Learners read the story aloud in pairs, taking turns.");
  await page.getByLabel(/^Evidence/).fill("Few questions checked whether learners understood the story.");
  await page.getByLabel("What worked well").fill("Learners read the story aloud in pairs and stayed engaged.");
  await page.getByLabel("One area to grow").fill("Few questions were asked about the meaning of the story.");
  await page.getByRole("button", { name: "Save observation" }).click();
  await expect(page.getByText("Suggested").first()).toBeVisible();
  await expect(page.getByText(/rule-based, not a measured accuracy/).first()).toBeVisible();
  await page.locator("li", { hasText: "Questions about meaning after reading" }).getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByText("Questions about meaning after reading").first()).toBeVisible();
  await shot(page, "04-observe");

  // 6 · coach: grounded feedback with a real, inspectable source
  await page.getByRole("link", { name: "Go to feedback" }).click();
  await expect(page.getByText("Simulated AI output").first()).toBeVisible();
  await page.getByRole("button", { name: "Generate draft" }).click();
  await expect(page.getByText("Draft · needs your review").first()).toBeVisible();
  await expect(page.getByText("R-14").first()).toBeVisible();
  await expect(page.getByText(/Illustrative practice card/).first()).toBeVisible();
  await shot(page, "05-feedback-draft");

  // approval is explicit and impossible to skip; edit first
  const next = page.locator("#next");
  await next.fill("Ask three why or what-next questions after each read-aloud this week.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Edited · needs approval").first()).toBeVisible();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText("Approved by you")).toBeVisible();
  await expect(page.getByText(/edited by you before approval/)).toBeVisible();
  await shot(page, "06-feedback-approved");

  // source inspection
  await page.getByRole("link", { name: "Inspect the practice card" }).first().click();
  await expect(page.getByRole("heading", { name: "Read-aloud with meaning questions" })).toBeVisible();
  await expect(page.getByText("Illustrative demo content")).toBeVisible();
  await page.goBack();

  // 7 · demonstrate
  await page.getByRole("link", { name: "Demonstrate", exact: true }).first().click();
  await page.getByRole("button", { name: "Generate demonstration" }).click();
  await expect(page.getByText("5-minute demonstration")).toBeVisible();
  await expect(page.getByText("Source practice card")).toBeVisible();
  await shot(page, "07-demonstration");
  await page.getByRole("button", { name: "Approve script" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText("Approved by you")).toBeVisible();

  // 8 · follow up: agree the commitment
  await page.getByRole("link", { name: "Follow up & report", exact: true }).first().click();
  await expect(page.getByLabel("Agreed next step")).toHaveValue(/three why or what-next questions/);
  await page.getByRole("button", { name: "Save commitment" }).click();
  await expect(page.getByText("Agreed commitment").first()).toBeVisible();

  // 9 · report from stored records; finalize
  await page.getByRole("button", { name: "Prepare report from saved records" }).click();
  await expect(page.getByText("Mentor visit report")).toBeVisible();
  await expect(page.getByText("AI-drafted · mentor-edited · approved")).toBeVisible();
  await expect(page.getByText("Follow-up on the previous commitment")).toBeVisible();
  await page.getByRole("button", { name: /Finalize report/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Finalize and complete visit" }).click();
  await expect(page.getByText("Report finalized")).toBeVisible();
  await shot(page, "08-report");

  // 10 · everything is reflected elsewhere
  await page.getByRole("link", { name: "Follow-ups", exact: true }).click();
  await expect(page.getByText(/Ask three why or what-next questions after each read-aloud this week\./).first()).toBeVisible();
  await shot(page, "09-follow-ups");
  await page.getByRole("link", { name: "Visits", exact: true }).click();
  await expect(page.getByText("Completed").first()).toBeVisible();
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page.getByText("Visits completed")).toBeVisible();
  expect(browserProblems, "no console errors, CSP violations or failed requests during the journey").toEqual([]);
});

test("unsafe or unauthorised requests are handled safely", async ({ page, request }) => {
  // anonymous: redirected, API refuses
  await page.goto("/visits");
  await expect(page).toHaveURL(/\/login/);
  expect((await request.get("/api/v1/visits")).status()).toBe(401);

  // a different mentor cannot open Asha's records
  await signIn(page, /Asha/);
  await page.goto("/visits");
  const href = await page.getByRole("link", { name: /\d{1,2} \w{3} \d{4}/ }).first().getAttribute("href");
  expect(href).toMatch(/\/visits\//);
  await signOut(page);
  await signIn(page, /Rakesh/);
  await page.goto(href!);
  await expect(page.getByText(/couldn’t find that record/)).toBeVisible();

  // supervisor: aggregate-only, no coaching content
  await signOut(page);
  await signIn(page, /Meena/);
  await expect(page.getByText("Practice areas tagged in observations")).toBeVisible();
  await expect(page.getByText(/Hidden · fewer than 5/).first()).toBeVisible();
  await shot(page, "10-supervisor");
  await page.goto("/visits");
  await expect(page.locator("body")).not.toContainText("T-101");
  await page.goto(href!);
  await expect(page).not.toHaveURL(href!);

  // curator manages the library and approves a draft card
  await signOut(page);
  await signIn(page, /Ishaan/);
  await page.goto("/practice-library/T-08");
  await expect(page.getByText("Not approved")).toBeVisible();
  await page.getByLabel("Review note").fill("Steps checked.");
  await page.getByRole("button", { name: "Approve card" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText("approved", { exact: true }).first()).toBeVisible();
});

test("mobile layout: navigation drawer works without horizontal overflow", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem("samvaad.tour.v1", "seen"));
  await page.goto(`/login`);
  await page.getByRole("button", { name: /Asha/ }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  for (const path of ["/dashboard", "/schools", "/visits", "/visits/new", "/follow-ups", "/reports", "/practice-library", "/practice-library/R-14", "/settings", "/feedback"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(1);
  }
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("dialog", { name: "Navigation" }).getByRole("link", { name: "Follow-ups" }).click();
  await expect(page).toHaveURL(/\/follow-ups/);
  await shot(page, "11-mobile-follow-ups");
  await ctx.close();
});

test("public education context: real data is labelled, sourced, and separate from demo records", async ({ page }) => {
  await signIn(page, /Asha/);
  await page.getByRole("link", { name: "Public context", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Public Education Context" })).toBeVisible();
  await expect(page.getByText("Public data · real source").first()).toBeVisible();
  await expect(page.getByText("Public data — not mentor observations").first()).toBeVisible();
  await expect(page.getByText(/Last successful import/)).toBeVisible();
  // provenance beside the figures
  await expect(page.getByText(/UDISE\+ 2024-25 · state-level · Table 2\.2/).first()).toBeVisible();
  // mixed reference periods are called out
  await expect(page.getByText("Different reference periods on this page")).toBeVisible();
  // charts have a table equivalent with a unit
  await page.getByText("View as table").first().click();
  await expect(page.getByRole("table", { name: /state comparison/i }).first()).toBeVisible();
  // the fictional demo schools never appear in public context
  await expect(page.locator("main")).not.toContainText("Kesar Vihar");
  await expect(page.locator("main")).not.toContainText("T-101");
  await shot(page, "12-public-context");

  // within-state view with confidence intervals for a state with district files
  await page.goto("/public-data?state=Rajasthan&indicator=aser_std3_5_read_std2");
  await expect(page.getByText("by division").first()).toBeVisible();
  await expect(page.getByText(/95% confidence interval/).first()).toBeVisible();
  await expect(page.getByText(/not school-level/i).first()).toBeVisible();

  // catalogue is honest about what was blocked
  await page.goto("/public-data/sources");
  await expect(page.getByText("Public data source catalogue")).toBeVisible();
  await expect(page.getByText("Needs manual access or approval")).toBeVisible();
  await expect(page.getByText(/CAPTCHA/).first()).toBeVisible();
  await expect(page.getByText("Last successful ingestion")).toBeVisible();
  await page.getByRole("link", { name: /UDISE\+ 2024-25 Booklet/ }).first().click();
  await expect(page.getByText("SHA-256")).toBeVisible();
  await expect(page.getByText("Known limitations")).toBeVisible();
  await shot(page, "13-source-detail");
});

test("knowledge base: curator approves official excerpts, then the mentor's feedback cites the verbatim excerpt", async ({ page }) => {
  // curator reviews the source excerpts and approves the card
  await signIn(page, /Ishaan/);
  await page.goto("/practice-library/K-R01");
  await expect(page.getByText("Official source").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Source excerpts" })).toBeVisible();
  await expect(page.getByText(/printed page 4 \(PDF page 6\)/)).toBeVisible();
  // cannot approve the card before the excerpts: the server refuses and says why
  await page.getByRole("button", { name: "Approve card" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText(/Review the source excerpts first/)).toBeVisible();
  for (let i = 0; i < 4; i++) {
    await page.getByRole("button", { name: "Approve excerpt" }).first().click();
    await expect(page.getByText("Excerpt approved").first()).toBeVisible();
  }
  await page.getByRole("button", { name: "Approve card" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText("Card approved").first()).toBeVisible();
  await shot(page, "14-official-card-approved");

  // mentor drafts feedback; the official card is retrieved and cited with its excerpt
  await signOut(page);
  await signIn(page, /Asha/);
  await page.goto("/visits?status=planned&q=Hindi"); // the planned Grade 2 Hindi follow-up visit
  await page.getByRole("link", { name: /\d{1,2} \w{3} \d{4}/ }).first().click();
  await page.getByRole("button", { name: "Start visit" }).click();
  await expect(page).toHaveURL(/\/observe$/);
  await page.getByLabel("What practice did you observe?").fill("Learners read the story aloud in pairs.");
  await page.getByLabel(/^Evidence/).fill("Few questions checked whether learners understood the story.");
  await page.getByLabel("One area to grow").fill("Few questions were asked about the meaning of the story after reading.");
  await page.getByRole("button", { name: "Save observation" }).click();
  await expect(page.getByText("Observation saved").first()).toBeVisible();
  await page.getByRole("link", { name: "Go to feedback" }).click();
  await page.getByRole("button", { name: "Generate draft" }).click();
  await expect(page.getByText("Draft · needs your review").first()).toBeVisible();
  await expect(page.getByText("Official source").first()).toBeVisible();
  await expect(page.getByText(/Source excerpt · printed page/).first()).toBeVisible();
  await expect(page.getByText(/Read-aloud is a practice where teachers/).first()).toBeVisible();
  await shot(page, "15-feedback-official-citation");
});

test("security headers are present on real responses and the CSP does not break pages", async ({ page, request }) => {
  const res = await request.get("/login");
  const h = res.headers();
  expect(h["content-security-policy"]).toMatch(/script-src 'self' 'nonce-/);
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["x-powered-by"]).toBeUndefined();
  expect(h["cache-control"]).toMatch(/no-store/);
  const api = await request.get("/api/v1/health");
  expect(api.headers()["x-content-type-options"]).toBe("nosniff");
  expect(api.headers()["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  expect(api.headers()["access-control-allow-origin"]).toBeUndefined(); // no CORS opened

  const problems: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") problems.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => problems.push(e.message.slice(0, 200)));
  await signIn(page, /Asha/);
  for (const path of ["/dashboard", "/schools", "/visits", "/follow-ups", "/reports", "/practice-library", "/public-data", "/public-data/sources", "/settings"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
  expect(problems).toEqual([]);
});
