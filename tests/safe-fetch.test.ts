import { describe, expect, it } from "vitest";
import { SOURCES } from "../scripts/data/sources";
import { allowedHosts, assertPublicResolution, assertSafeUrl, isPrivateAddress, readCappedBody, safeFetch, UnsafeFetchError } from "../scripts/data/safe-fetch";

const allow = allowedHosts(["https://example.gov.in/a.pdf", "https://data.example.org/x"]);
const reason = async (p: Promise<unknown>) => { try { await p; return "none"; } catch (e) { return (e as UnsafeFetchError).reason ?? "other"; } };
const pub = async () => ["93.184.216.34"];

describe("URL validation", () => {
  it.each([
    ["http://example.gov.in/a", "scheme"],
    ["file:///etc/passwd", "scheme"],
    ["ftp://example.gov.in/a", "scheme"],
    ["https://user:pw@example.gov.in/a", "credentials"],
    ["https://127.0.0.1/a", "ip_literal"],
    ["https://[::1]/a", "ip_literal"],
    ["https://169.254.169.254/latest/meta-data", "ip_literal"],
    ["https://localhost/a", "local_host"],
    ["https://db.internal/a", "local_host"],
    ["https://evil.example.com/a", "host_not_allowed"],
    ["https://example.gov.in.evil.com/a", "host_not_allowed"],
    ["not a url", "invalid_url"],
  ])("%s is refused (%s)", (url, why) => {
    try { assertSafeUrl(url, allow); throw new Error("accepted"); } catch (e) { expect((e as UnsafeFetchError).reason).toBe(why); }
  });
  it("accepts allowlisted https hosts", () => {
    expect(assertSafeUrl("https://EXAMPLE.gov.in/a.pdf", allow).hostname).toBe("example.gov.in");
  });
  it("every registry source URL passes the allowlist built from the registry", () => {
    const urls = SOURCES.flatMap((s) => [s.source_url, s.download_url].filter((u): u is string => !!u));
    const a = allowedHosts(urls);
    for (const u of urls) expect(() => assertSafeUrl(u, a)).not.toThrow();
  });
});

describe("address checks", () => {
  it.each(["10.0.0.1", "127.0.0.1", "169.254.169.254", "172.16.5.4", "172.31.255.1", "192.168.1.1", "100.64.0.1", "0.0.0.0", "::1", "fc00::1", "fd12::1", "fe80::1", "::ffff:10.0.0.1"])("%s is private", (ip) => expect(isPrivateAddress(ip)).toBe(true));
  it.each(["8.8.8.8", "93.184.216.34", "172.32.0.1", "2606:4700::1111"])("%s is public", (ip) => expect(isPrivateAddress(ip)).toBe(false));
  it("a public hostname that resolves to a private address (DNS rebinding style) is refused", async () => {
    expect(await reason(assertPublicResolution("example.gov.in", async () => ["10.1.2.3"]))).toBe("private_address");
    expect(await reason(assertPublicResolution("example.gov.in", async () => ["93.184.216.34", "127.0.0.1"]))).toBe("private_address");
    expect(await reason(assertPublicResolution("example.gov.in", async () => []))).toBe("dns");
  });
});

describe("redirects and size caps", () => {
  const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to } });
  it("a redirect to another host, to http, or to a metadata IP is refused", async () => {
    for (const to of ["https://evil.example.com/x", "http://example.gov.in/x", "https://169.254.169.254/x"]) {
      expect(await reason(safeFetch("https://example.gov.in/a", { allow, resolve: pub, fetchImpl: (async () => redirect(to)) as typeof fetch }))).toMatch(/host_not_allowed|scheme|ip_literal/);
    }
  });
  it("follows a safe redirect, and stops redirect loops", async () => {
    let n = 0;
    const ok = await safeFetch("https://example.gov.in/a", { allow, resolve: pub, fetchImpl: (async () => (n++ === 0 ? redirect("/b") : new Response("hello"))) as typeof fetch });
    expect(ok.body.toString()).toBe("hello");
    expect(ok.finalUrl).toBe("https://example.gov.in/b");
    expect(await reason(safeFetch("https://example.gov.in/a", { allow, resolve: pub, fetchImpl: (async () => redirect("/loop")) as typeof fetch }))).toBe("too_many_redirects");
  });
  it("redirect hops are never auto-followed by fetch", async () => {
    const seen: string[] = [];
    await safeFetch("https://example.gov.in/a", { allow, resolve: pub, fetchImpl: (async (_u: unknown, init?: RequestInit) => { seen.push(String(init?.redirect)); return new Response("x"); }) as typeof fetch });
    expect(seen).toEqual(["manual"]);
  });
  it("oversized bodies are cut off, by declared length and by streamed length", async () => {
    expect(await reason(readCappedBody(new Response("x".repeat(100), { headers: { "content-length": "100" } }), 50))).toBe("too_large");
    const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(40)); c.enqueue(new Uint8Array(40)); c.close(); } });
    expect(await reason(readCappedBody(new Response(stream), 50))).toBe("too_large");
    expect((await readCappedBody(new Response("tiny"), 50)).length).toBe(4);
  });
});
