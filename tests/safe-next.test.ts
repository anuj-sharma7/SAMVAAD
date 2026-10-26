import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/safe-next";

describe("safeNext (no open redirect after sign-in)", () => {
  it.each(["/field", "/field?source=pwa", "/field#/sync", "/visits/123/report"])("allows the local path %s", (p) => expect(safeNext(p)).toBe(p));
  it.each([
    "https://evil.example/", "//evil.example", "///evil.example", "/" + String.fromCharCode(92) + "evil.example", "javascript:alert(1)", "data:text/html,x", "field", "",
    "/%2f%2fevil.example", "/ok\nSet-Cookie: x=1", "/a b", "http:/evil", String.fromCharCode(92, 92) + "evil", "/" + "a".repeat(300),
  ])("falls back for %j", (p) => expect(safeNext(p)).toBe("/dashboard"));
  it("handles missing and array values", () => {
    expect(safeNext(undefined)).toBe("/dashboard");
    expect(safeNext(null, "/x")).toBe("/x");
    expect(safeNext(["/field", "/other"])).toBe("/field");
  });
});
