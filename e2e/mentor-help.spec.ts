import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import zlib from "node:zlib";

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

test("optional photo on a problem: add while logging and later, view, delete; limit of three", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("samvaad.tour.v1", "seen"));
  await signIn(page);
  await page.goto("/mentor-help/academic");
  const png = makePng();
  await page.getByLabel(/What did you see/).fill("Wall chart is torn and children cannot see letters");
  await page.locator("#ai-photo").setInputFiles({ name: "wall.png", mimeType: "image/png", buffer: png });
  await expect(page.getByText("wall.png")).toBeVisible();
  await page.getByRole("button", { name: "Save and get AI suggestion" }).click();
  const card = page.getByRole("listitem").filter({ hasText: "Wall chart is torn" });
  await expect(card.getByRole("img", { name: "Photo 1 of this problem" })).toBeVisible();
  // the image really is served, as an image, only to the signed-in mentor
  const src = await card.getByRole("img").first().getAttribute("src");
  const ok = await page.request.get(src!);
  expect(ok.status()).toBe(200);
  expect(ok.headers()["content-type"]).toBe("image/jpeg");
  const anon = await (await page.context().browser()!.newContext({ baseURL: "http://localhost:3200" })).request.get(src!);
  expect(anon.status()).toBe(401);

  // add two more, then the add button disappears
  for (const n of [2, 3]) {
    await card.locator('input[type="file"]').setInputFiles({ name: `p${n}.png`, mimeType: "image/png", buffer: png });
    await expect(card.getByRole("img", { name: `Photo ${n} of this problem` })).toBeVisible();
  }
  await expect(card.getByText("Add photo")).toHaveCount(0);
  await card.getByRole("button", { name: "Delete photo 3" }).click();
  await expect(card.getByRole("img")).toHaveCount(2);

  // a file that is not a picture is refused and the problem is kept
  await card.locator('input[type="file"]').setInputFiles({ name: "x.png", mimeType: "image/png", buffer: Buffer.from("not really an image") });
  await expect(page.getByText(/could not be read as a picture|photo was not/i).first()).toBeVisible();
  const a11y = await new AxeBuilder({ page }).analyze();
  expect(a11y.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
});

/** A valid 16x16 red PNG built in memory (no fixture file needed). */
function makePng(): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const w = 16, h = 16;
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.concat(Array.from({ length: w }, () => Buffer.from([200, 30, 30])))]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

test("the Observe page offers the Mentor Help helpers with this visit's class, subject and school filled in", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("samvaad.tour.v1", "seen"));
  await signIn(page);
  const schools = await (await page.request.get("/api/v1/schools")).json();
  const schoolId = (schools.data?.items ?? schools.items)[0].id;
  const created = await page.request.post("/api/v1/visits", {
    data: { school_id: schoolId, teacher_alias: "T-901", scheduled_at: new Date(Date.now() + 86_400_000).toISOString(), grade: 4, subject: "Mathematics", language: "en", purpose: "Routine academic support visit", save_as: "planned" },
    headers: { "idempotency-key": crypto.randomUUID() },
  });
  expect([200, 201]).toContain(created.status());
  const body = await created.json();
  const visitId = (body.data ?? body).id;
  await page.request.post(`/api/v1/visits/${visitId}/transition`, { data: { to: "in_progress" } });

  await page.goto(`/visits/${visitId}/observe`);
  const card = page.getByTestId("mentor-help-card");
  await expect(card.getByRole("heading", { name: "AI helpers for this visit" })).toBeVisible();

  // student questions: class 4 and Maths are already chosen, and there is a way back to the visit
  await card.getByTestId("mh-questions").click();
  await expect(page.getByLabel("Class", { exact: true })).toHaveValue("4");
  await expect(page.getByLabel("Subject")).toHaveValue("Mathematics");
  await expect(page.getByRole("link", { name: "Back to the visit" })).toBeVisible();
  await page.getByRole("button", { name: "Make questions" }).click();
  await expect(page.getByText("Ask the children").first()).toBeVisible();
  await page.getByRole("link", { name: "Back to the visit" }).click();
  await expect(page).toHaveURL(new RegExp(`/visits/${visitId}/observe`));

  // academic problem: class, subject and the school come filled in
  await page.getByTestId("mentor-help-card").getByTestId("mh-academic").click();
  await expect(page.getByLabel("Class (optional)")).toHaveValue("4");
  await expect(page.getByLabel("Subject (optional)")).toHaveValue("Mathematics");
  await expect(page.getByLabel("School (optional)")).not.toHaveValue("");

  // mid-day meal and ground
  await page.goBack();
  await page.getByTestId("mentor-help-card").getByTestId("mh-meal").click();
  await expect(page.getByRole("heading", { name: "Mid-day meal and ground", level: 1 })).toBeVisible();
  const a11y = await new AxeBuilder({ page }).analyze();
  expect(a11y.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
});

test("a question set can be copied as plain text and printed", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => {
    localStorage.setItem("samvaad.tour.v1", "seen");
    (window as unknown as { __printed: number }).__printed = 0;
    window.print = () => { (window as unknown as { __printed: number }).__printed += 1; };
  });
  await signIn(page);
  await page.goto("/mentor-help/questions");
  await page.getByLabel("Class", { exact: true }).selectOption("3");
  await page.getByLabel("Subject").selectOption("Mathematics");
  await page.getByRole("button", { name: "Make questions" }).click();
  await expect(page.getByText("Ask the children").first()).toBeVisible();

  await page.getByRole("button", { name: "Copy as text" }).click();
  await expect(page.getByText("Copied. Paste it in WhatsApp or notes.")).toBeVisible();
  // the Windows clipboard turns line breaks into CRLF
  const text = (await page.evaluate(() => navigator.clipboard.readText())).replaceAll("\r\n", "\n");
  expect(text).toMatch(/^Class 3 · Maths\n/);
  expect(text).toContain("1. ");
  expect(text).toContain("(Ask the children)");
  expect(text).toContain("A good answer sounds like:");

  await page.getByRole("button", { name: "Print or save as PDF" }).click();
  expect(await page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);
});
