import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// The public download page: latest Android version, its checksum and install steps. No sign-in. English copy (the config pins the English locale).

test("the login page links to the download details, and the page shows the latest version", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("samvaad.tour.v1", "seen"));
  await page.goto("/login");
  await page.getByRole("link", { name: "Latest version, checksum and install steps" }).click();
  await expect(page).toHaveURL(/\/download$/);
  await expect(page.getByRole("heading", { name: "SAMVAAD Android app", level: 1 })).toBeVisible();
  const card = page.getByTestId("latest-release");
  await expect(card.getByText("Version 0.5.0")).toBeVisible();
  await expect(card.getByText("Test build")).toBeVisible();
  await expect(card.getByRole("link", { name: /Download the app \(v0\.5\.0\)/ })).toHaveAttribute("href", "/downloads/SAMVAAD.apk");
  await expect(page.getByText("How to install")).toBeVisible();
  await expect(page.getByText("Please note")).toBeVisible();
});

test("the checksum on the page is the checksum of the file the button downloads", async ({ page, request }) => {
  await page.goto("/download");
  const shown = (await page.getByTestId("release-sha").innerText()).trim();
  const res = await request.get("/downloads/SAMVAAD.apk");
  expect(res.status()).toBe(200);
  const body = await res.body();
  expect(createHash("sha256").update(body).digest("hex")).toBe(shown);
  expect(body.subarray(0, 2).toString("latin1")).toBe("PK"); // an Android package is a zip
});

test("the download page works in Hindi and has no accessibility violations", async ({ page, context }) => {
  await context.addCookies([{ name: "samvaad_locale", value: "hi", domain: "localhost", path: "/" }]);
  await page.goto("/download");
  await expect(page.getByRole("heading", { name: "संवाद Android ऐप", level: 1 })).toBeVisible();
  await expect(page.getByText("इंस्टॉल कैसे करें")).toBeVisible();
  const a11y = await new AxeBuilder({ page }).analyze();
  expect(a11y.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
});
