import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APP_RELEASE, apkSizeLabel } from "@/lib/app-release";

const file = path.join(process.cwd(), "public", APP_RELEASE.url);

describe("app release record", () => {
  it("matches the APK that is actually served (size and SHA-256)", () => {
    const bytes = fs.readFileSync(file);
    expect(bytes.length).toBe(APP_RELEASE.sizeBytes);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(APP_RELEASE.sha256);
  });

  it("is a real Android package (a zip that starts with PK)", () => {
    const head = fs.readFileSync(file).subarray(0, 2).toString("latin1");
    expect(head).toBe("PK");
  });

  it("has a well-formed version, date and file name", () => {
    expect(APP_RELEASE.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(APP_RELEASE.builtOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(APP_RELEASE.fileName).toContain(APP_RELEASE.version);
    expect(APP_RELEASE.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("formats the size in megabytes", () => {
    expect(apkSizeLabel(9_196_426)).toBe("8.8 MB");
  });
});
