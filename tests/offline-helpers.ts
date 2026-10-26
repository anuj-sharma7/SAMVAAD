import { IDBFactory } from "fake-indexeddb";
import "@/lib/api/handlers";
import { dispatch } from "@/lib/api/router";
import { createSession } from "@/lib/auth/session";
import { httpTransport } from "@/lib/offline/http-transport";
import { LocalStore } from "@/lib/offline/store";
import { runSync, type Transport } from "@/lib/offline/sync-engine";
import { resetRateLimits } from "@/lib/security/rate-limit";
import type { Db } from "@/lib/db/client";

export const newFactory = () => new IDBFactory();
export const openStore = (accountId: string, factory: IDBFactory, now?: () => Date) => LocalStore.open(accountId, { factory, now });

export interface Faults {
  /** requests that fail before reaching the server (device offline) */
  offline: boolean;
  /** next N pushes answered 503 before anything is applied */
  fail503Push: number;
  /** next push: the server COMMITS the batch, but the response never reaches the device (timeout after commit) */
  dropResponseOnce: boolean;
  /** next N requests answered 503 by the "server" (nothing applied) */
  fail503: number;
  /** next push answers 429 with Retry-After */
  rateLimitOnce: number | null;
  /** called with the path for every request that reaches the server */
  onRequest?: (path: string, method: string) => Promise<void> | void;
  /** record of paths that reached the server */
  seen: string[];
}

/**
 * The real browser transport (http-transport.ts) wired straight to the real API router and an in-memory database,
 * with switches to simulate a flaky network. No mock of the server logic: sync tests exercise the actual services.
 */
export function makeDevice(db: Db, personaId: string) {
  const faults: Faults = { offline: false, dropResponseOnce: false, fail503: 0, fail503Push: 0, rateLimitOnce: null, seen: [] };
  let token = createSession(db, personaId).token;
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (faults.offline) throw new TypeError("Failed to fetch");
    resetRateLimits(); // the sync tests are about sync behaviour, not the per-minute limits (those have their own tests)
    const path = url.replace(/^\/api\/v1/, "");
    const method = (init?.method ?? "GET").toUpperCase();
    if (faults.fail503 > 0) {
      faults.fail503--;
      return new Response(JSON.stringify({ error: { code: "db_busy", message: "busy" } }), { status: 503, headers: { "retry-after": "1" } });
    }
    if (faults.fail503Push > 0 && path.startsWith("/sync/push")) {
      faults.fail503Push--;
      return new Response(JSON.stringify({ error: { code: "db_busy", message: "busy" } }), { status: 503 });
    }
    if (faults.rateLimitOnce !== null && path.startsWith("/sync/push")) {
      const s = faults.rateLimitOnce;
      faults.rateLimitOnce = null;
      return new Response(JSON.stringify({ error: { code: "rate_limited", message: "slow down" } }), { status: 429, headers: { "retry-after": String(s) } });
    }
    faults.seen.push(`${method} ${path}`);
    await faults.onRequest?.(path, method);
    const headers: Record<string, string> = { host: "localhost:3000", cookie: `samvaad_session=${token}` };
    if (init?.body) headers["content-type"] = "application/json";
    const res = await dispatch(new Request(`http://localhost:3000/api/v1${path}`, { method, headers, body: init?.body as string | undefined }), path.split("?")[0], db);
    if (faults.dropResponseOnce && path.startsWith("/sync/push")) {
      faults.dropResponseOnce = false;
      throw new TypeError("network connection lost"); // the server already committed
    }
    return res;
  }) as typeof fetch;
  const transport: Transport = httpTransport(fetchImpl);
  return {
    faults, transport,
    /** simulate the session expiring on the server */
    expireSession() { token = "expired-or-revoked-token-0000000000"; },
    /** sign in again as the same (or another) persona */
    signIn(persona = personaId) { token = createSession(db, persona).token; },
    sync: (store: LocalStore, opts: Parameters<typeof runSync>[2] = {}) => runSync(store, transport, opts),
  };
}

export const onlineSnapshot = async (store: LocalStore, device: ReturnType<typeof makeDevice>) => store.applySnapshot(await device.transport.snapshot());
