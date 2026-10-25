/**
 * Guarded HTTP fetch for the public-data downloader (SSRF / runaway-download protection).
 * - https only, hostname must be on the allowlist derived from the source registry
 * - redirects are followed manually (max 5) and every hop is re-validated
 * - loopback / private / link-local / metadata addresses are refused, including after DNS resolution
 * - the body is streamed and aborted past a byte cap
 * Residual risk: DNS can change between the check and the connect (TOCTOU); acceptable for a developer-run script.
 */
import dns from "node:dns/promises";
import net from "node:net";

export class UnsafeFetchError extends Error {
  constructor(public reason: string, message: string) {
    super(message);
    this.name = "UnsafeFetchError";
  }
}

export const MAX_DOWNLOAD_BYTES = 60 * 1024 * 1024;
export const MAX_REDIRECTS = 5;

export function isPrivateAddress(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
    );
  }
  if (v === 6) {
    const l = ip.toLowerCase();
    if (l === "::1" || l === "::") return true;
    if (l.startsWith("::ffff:")) return isPrivateAddress(l.slice(7));
    return /^f[cd]/.test(l) || /^fe[89ab]/.test(l) || l.startsWith("ff");
  }
  return false;
}

export function allowedHosts(urls: string[]): Set<string> {
  return new Set(urls.map((u) => new URL(u).hostname.toLowerCase()));
}

export function assertSafeUrl(raw: string, allow: Set<string>): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new UnsafeFetchError("invalid_url", "URL could not be parsed");
  }
  if (u.protocol !== "https:") throw new UnsafeFetchError("scheme", `Only https is allowed (got ${u.protocol})`);
  if (u.username || u.password) throw new UnsafeFetchError("credentials", "URLs with embedded credentials are refused");
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (net.isIP(host)) throw new UnsafeFetchError("ip_literal", "IP-literal hosts are refused");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new UnsafeFetchError("local_host", `Host ${host} is not a public host`);
  }
  if (!allow.has(host)) throw new UnsafeFetchError("host_not_allowed", `Host ${host} is not in the source registry allowlist`);
  return u;
}

type Resolver = (host: string) => Promise<string[]>;
const defaultResolver: Resolver = async (host) => (await dns.lookup(host, { all: true })).map((a) => a.address);

export async function assertPublicResolution(host: string, resolve: Resolver = defaultResolver): Promise<void> {
  const addrs = await resolve(host);
  if (addrs.length === 0) throw new UnsafeFetchError("dns", `Host ${host} did not resolve`);
  const bad = addrs.find(isPrivateAddress);
  if (bad) throw new UnsafeFetchError("private_address", `Host ${host} resolves to a non-public address (${bad})`);
}

export async function readCappedBody(res: Response, maxBytes: number): Promise<Buffer> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel();
    throw new UnsafeFetchError("too_large", `Declared size ${declared} exceeds the ${maxBytes}-byte cap`);
  }
  if (!res.body) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let total = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new UnsafeFetchError("too_large", `Body exceeded the ${maxBytes}-byte cap`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

export interface SafeFetchOptions {
  allow: Set<string>;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
  fetchImpl?: typeof fetch;
  resolve?: Resolver;
}

export async function safeFetch(url: string, o: SafeFetchOptions): Promise<{ res: Response; body: Buffer; finalUrl: string }> {
  const doFetch = o.fetchImpl ?? fetch;
  const signal = AbortSignal.timeout(o.timeoutMs ?? 60_000);
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const u = assertSafeUrl(current, o.allow);
    await assertPublicResolution(u.hostname, o.resolve);
    const res = await doFetch(u, { headers: o.headers, redirect: "manual", signal });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      await res.body?.cancel();
      current = new URL(res.headers.get("location")!, u).toString();
      continue;
    }
    return { res, body: await readCappedBody(res, o.maxBytes ?? MAX_DOWNLOAD_BYTES), finalUrl: u.toString() };
  }
  throw new UnsafeFetchError("too_many_redirects", `More than ${MAX_REDIRECTS} redirects`);
}
