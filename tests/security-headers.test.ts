import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy, config } from "@/proxy";

const get = (res: Response, h: string) => res.headers.get(h) ?? "";

describe("security headers (proxy)", () => {
  const res = proxy(new NextRequest("http://localhost:3000/dashboard"));

  it("sets the standard hardening headers on pages", () => {
    expect(get(res, "x-content-type-options")).toBe("nosniff");
    expect(get(res, "x-frame-options")).toBe("DENY");
    expect(get(res, "referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(get(res, "permissions-policy")).toMatch(/camera=\(\)/);
    expect(get(res, "permissions-policy")).toMatch(/microphone=\(\)/);
    expect(get(res, "cross-origin-opener-policy")).toBe("same-origin");
  });

  it("uses a strict, nonce-based CSP without unsafe-inline scripts", () => {
    const csp = get(res, "content-security-policy");
    expect(csp).toMatch(/default-src 'self'/);
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    const scriptSrc = csp.split(";").find((d) => d.trim().startsWith("script-src"))!;
    expect(scriptSrc).not.toMatch(/unsafe-inline/);
    expect(scriptSrc).not.toMatch(/unsafe-eval/); // not in test/production mode
    expect(csp).toMatch(/object-src 'none'/);
    expect(csp).toMatch(/frame-ancestors 'none'/);
    expect(csp).toMatch(/base-uri 'self'/);
    expect(csp).toMatch(/form-action 'self'/);
    expect(csp).toMatch(/connect-src 'self'/); // no third-party network access from the page
  });

  it("generates a fresh nonce per request", () => {
    const nonce = (r: Response) => get(r, "content-security-policy").match(/'nonce-([^']+)'/)![1];
    const a = nonce(proxy(new NextRequest("http://localhost:3000/a")));
    const b = nonce(proxy(new NextRequest("http://localhost:3000/b")));
    expect(a).not.toBe(b);
  });

  it("only enables HSTS and upgrade-insecure-requests when HTTPS is declared", () => {
    expect(get(res, "strict-transport-security")).toBe("");
    expect(get(res, "content-security-policy")).not.toMatch(/upgrade-insecure-requests/);
    process.env.SAMVAAD_HTTPS = "true";
    try {
      const secure = proxy(new NextRequest("https://example.test/dashboard"));
      expect(get(secure, "strict-transport-security")).toMatch(/max-age=\d+/);
      expect(get(secure, "content-security-policy")).toMatch(/upgrade-insecure-requests/);
    } finally {
      delete process.env.SAMVAAD_HTTPS;
    }
  });

  it("does not run on API routes or static assets (the API router sets its own headers)", () => {
    const source = (config.matcher[0] as { source: string }).source;
    const re = new RegExp(`^${source}$`);
    expect(re.test("/api/v1/health")).toBe(false);
    expect(re.test("/_next/static/chunks/a.js")).toBe(false);
    expect(re.test("/dashboard")).toBe(true);
  });
});
