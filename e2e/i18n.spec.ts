import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";

// Runs after flow.spec.ts and security.spec.ts against the same throw-away database.
test.describe.configure({ mode: "serial" });
fs.mkdirSync("e2e-screenshots", { recursive: true });

const KEY_PATTERN = /\b(common|nav|login|settings|dashboard|schools|visits|observe|feedback|demo|report|followups|library|publicdata|help|errors|brief)\.[a-zA-Z_]+(\.[a-zA-Z_]+)*\b/;
const STOP = ["the", "and", "your", "for", "with", "this", "that", "you", "are", "not", "will", "from", "have", "can", "has", "was", "been"];

/**
 * Free text that is DATA, not interface copy, is written in English in the seed/registry (mentor-authored commitments and
 * observations, practice-card bodies without a Hindi version, source-registry access notes and caveats published by the
 * source). It is excluded from the leak scan on purpose; everything else must be translated.
 */
const DATA_TEXT = [
  /next story this week|next maths lesson|silently to three|read-aloud this week|how did you get that|two or three problems|the mentor looks for:/i,
  /learners|the teacher (waits|asks)|number talk|slates|picture walk|each day begins/i,
  /HTTP [0-9]{3}|Network error|CAPTCHA control|microdata requires|Household sample survey/i,
];

/** Visible text nodes that look like English interface copy (two or more common English function words). */
async function englishLeaks(page: Page): Promise<string[]> {
  const allow = DATA_TEXT.map((r) => ({ source: r.source, flags: r.flags }));
  return page.evaluate(({ stop, allow }) => {
    const out: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = walker.nextNode())) {
      const text = (n.textContent ?? "").trim();
      const el = n.parentElement;
      if (!text || !el || el.closest("script,style,noscript,[lang='en'],[data-source-text]")) continue;
      const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
      const hits = new Set(words.filter((w) => stop.includes(w)));
      if (hits.size >= 2 && !allow.some((a) => new RegExp(a.source, a.flags).test(text))) out.push(text.slice(0, 110));
    }
    return out;
  }, { stop: STOP, allow });
}

async function setHindi(page: Page) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "हिन्दी" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
}

test("login page switches to Hindi; the choice persists across reload and sign-in", async ({ page }) => {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await setHindi(page);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
  await expect(page.locator("body")).not.toContainText("Sign in");
  expect(await page.locator("body").innerText()).not.toMatch(KEY_PATTERN);
  await page.screenshot({ path: "e2e-screenshots/20-login-hi.png", fullPage: true });
  await page.getByRole("button", { name: /Asha/ }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
});

test("every main page renders in Hindi with no raw keys, no English interface copy and no axe violations", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("samvaad.tour.v1", "seen")); // tour has its own test
  await setHindi(page);
  await page.getByRole("button", { name: /Asha/ }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  const problems: string[] = [];
  const routes = ["/dashboard", "/schools", "/visits", "/visits/new", "/follow-ups", "/practice-library", "/public-data", "/public-data/sources", "/reports", "/feedback", "/demonstrate", "/settings", "/help"];
  for (const url of routes) {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    expect(await page.locator("html").getAttribute("lang"), url).toBe("hi");
    const text = await page.locator("body").innerText();
    if (KEY_PATTERN.test(text)) problems.push(`${url}: raw translation key: ${text.match(KEY_PATTERN)![0]}`);
    if (/\bundefined\b|\[object Object\]|NaN/.test(text)) problems.push(`${url}: undefined/NaN in text`);
    for (const leak of await englishLeaks(page)) problems.push(`${url}: English copy: "${leak}"`);
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    for (const v of axe.violations) problems.push(`${url}: axe ${v.id} (${v.impact}) ${v.nodes[0]?.target.join(" ")}`);
    if (url === "/dashboard") await page.screenshot({ path: "e2e-screenshots/21-dashboard-hi.png", fullPage: true });
  }
  expect(problems).toEqual([]);
});

test("the visit workflow pages work in Hindi (visit page, observe, feedback, report, brief, summary)", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("samvaad.tour.v1", "seen"));
  await setHindi(page);
  await page.getByRole("button", { name: /Asha/ }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/visits");
  await page.waitForLoadState("networkidle");
  const hrefs = await page.locator("a[href^='/visits/']").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!).filter((h) => /^\/visits\/[^/]+$/.test(h) && !h.endsWith("/new")));
  expect(hrefs.length).toBeGreaterThan(0);
  const base = hrefs[0];
  const problems: string[] = [];
  for (const suffix of ["", "/brief", "/observe", "/feedback", "/demonstrate", "/report", "/summary"]) {
    await page.goto(base + suffix);
    await page.waitForLoadState("networkidle");
    const text = await page.locator("body").innerText();
    if (KEY_PATTERN.test(text)) problems.push(`${base + suffix}: raw key ${text.match(KEY_PATTERN)![0]}`);
    for (const leak of await englishLeaks(page)) problems.push(`${base + suffix}: English copy: "${leak}"`);
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    for (const v of axe.violations) problems.push(`${base + suffix}: axe ${v.id} (${v.impact}) ${v.nodes[0]?.target.join(" ")}`);
    await page.screenshot({ path: `e2e-screenshots/22-visit${suffix.replace("/", "-") || "-home"}-hi.png`, fullPage: true });
  }
  expect(problems).toEqual([]);
});

test("Hindi layout on a phone-sized screen has no horizontal overflow", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, baseURL: "http://localhost:3200" });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem("samvaad.tour.v1", "seen"));
  await setHindi(page);
  await page.getByRole("button", { name: /Asha/ }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  const overflow: string[] = [];
  for (const url of ["/dashboard", "/schools", "/visits", "/visits/new", "/follow-ups", "/practice-library", "/public-data", "/settings", "/help"]) {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    if (w.sw > w.cw + 1) overflow.push(`${url}: ${w.sw} > ${w.cw}`);
  }
  await page.goto("/visits/new");
  await page.screenshot({ path: "e2e-screenshots/23-newvisit-hi-mobile.png", fullPage: true });
  expect(overflow).toEqual([]);
  await ctx.close();
});

test("English text and Hindi text zoomed to 200% still reflow (no horizontal scroll at 640px, equivalent to 200% of 1280)", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 800 }, baseURL: "http://localhost:3200" });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem("samvaad.tour.v1", "seen"));
  await setHindi(page);
  await page.getByRole("button", { name: /Asha/ }).click();
  for (const url of ["/dashboard", "/visits/new", "/settings"]) {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    expect(w.sw, url).toBeLessThanOrEqual(w.cw + 1);
  }
  await ctx.close();
});

test("first-run tour: appears once, is skippable by keyboard, closes with Escape, replays from Help", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /Asha/ }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/What SAMVAAD helps with|संवाद किसमें मदद करता है/);
  await page.keyboard.press("Tab");
  const inside = await page.evaluate(() => !!document.activeElement?.closest("dialog"));
  expect(inside).toBe(true); // focus is trapped inside the dialog
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("dialog")).toBeHidden(); // not shown again
  await page.goto("/help");
  await page.getByRole("button", { name: /Show the quick tour again|छोटा परिचय फिर से देखें/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: /^(Next|आगे)$/ }).click();
  await page.getByRole("button", { name: /Start using SAMVAAD|संवाद इस्तेमाल करना शुरू करें/ }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("glossary search filters in the active language", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("samvaad.tour.v1", "seen"));
  await page.goto("/login");
  await page.getByRole("button", { name: /Asha/ }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto("/help");
  await page.waitForLoadState("networkidle");
  await page.getByLabel(/Search the glossary|शब्दावली में खोजें/).fill("DIET");
  await expect(page.locator("dl dt")).toHaveCount(1);
  await page.getByLabel(/Search the glossary|शब्दावली में खोजें/).fill("zzzz-nothing");
  await expect(page.getByText(/No matching word|कोई शब्द नहीं मिला/).first()).toBeVisible();
});

test("brief and teacher summary: planned visits show a brief; a finished visit has a printable one-page summary", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /Asha/ }).click();
  await expect(page).toHaveURL(/dashboard/);
  const list = await (await page.request.get("/api/v1/visits?limit=100")).json();
  const items = list.data.items as { id: string; status: string }[];

  const planned = items.find((v) => v.status === "planned")!;
  await page.goto(`/visits/${planned.id}/brief`);
  await expect(page.getByRole("heading", { name: /Before your visit/ })).toBeVisible();
  await expect(page.getByText(/What was agreed last time/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Start observing/ })).toBeVisible();

  let summaryVisit: string | null = null;
  for (const v of items.filter((x) => x.status === "completed" || x.status === "pending_review")) {
    const r = await page.request.get(`/api/v1/visits/${v.id}/action-summary`);
    if (r.status() === 200) { summaryVisit = v.id; break; }
  }
  expect(summaryVisit, "flow.spec leaves one visit with an agreed next step").not.toBeNull();
  await page.goto(`/visits/${summaryVisit}/summary`);
  await expect(page.getByRole("heading", { level: 1, name: /Agreed next step/ })).toBeVisible();
  await expect(page.getByText(/What to try/)).toBeVisible();
  await expect(page.getByText(/Reviewed and approved by/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Print summary/ })).toBeVisible();
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
  await page.screenshot({ path: "e2e-screenshots/24-summary.png", fullPage: true });
});
