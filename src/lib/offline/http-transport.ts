import { TransportError, type Transport, type WireOp, type WireResult } from "./sync-engine";
import type { Snapshot } from "./types";

type Envelope<T> = { data?: T; error?: { code?: string; message?: string } };

async function call<T>(method: string, path: string, body: unknown, timeoutMs: number, fetchImpl: typeof fetch): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetchImpl(`/api/v1${path}`, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctl.signal,
      cache: "no-store",
    });
  } catch {
    throw new TransportError("network"); // offline, DNS, timeout or aborted: the server may or may not have seen it
  } finally {
    clearTimeout(timer);
  }
  const json = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (res.ok && json && json.data !== undefined) return json.data;
  const code = json?.error?.code;
  if (res.status === 401) throw new TransportError("auth", 401, code);
  if (res.status === 429) throw new TransportError("rate", 429, code, Number(res.headers.get("retry-after") ?? 0) * 1000 || undefined);
  if (res.status >= 500) throw new TransportError("server", res.status, code, Number(res.headers.get("retry-after") ?? 0) * 1000 || undefined);
  throw new TransportError("client", res.status, code);
}

/** The real transport used by the app. Credentials are the browser's HttpOnly session cookie; no token is ever read or stored by script. */
export function httpTransport(fetchImpl: typeof fetch = fetch): Transport {
  return {
    me: () => call<{ actor: { id: string } }>("GET", "/me", undefined, 8000, fetchImpl).then((d) => ({ id: d.actor.id })),
    push: (accountId: string, ops: WireOp[]) => call<{ results: WireResult[]; server_time: string }>("POST", "/sync/push", { account_id: accountId, ops }, 20000, fetchImpl),
    snapshot: () => call<Snapshot>("GET", "/sync/snapshot", undefined, 20000, fetchImpl),
  };
}

/** A real request to the server: `navigator.onLine` only says a network interface exists, not that SAMVAAD is reachable. */
export async function probeServer(fetchImpl: typeof fetch = fetch, timeoutMs = 4000): Promise<boolean> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl("/api/v1/health", { cache: "no-store", signal: ctl.signal, credentials: "omit" });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
