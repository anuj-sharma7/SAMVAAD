/**
 * Small in-memory fixed-window rate limiter.
 *
 * Scope and honesty: this is per-process and resets on restart. It stops accidental loops, double-click storms and casual
 * abuse of expensive endpoints (AI generation, sign-in) in a single-server deployment. It is NOT a defence against a
 * distributed attacker; a production deployment needs a shared store and an edge/WAF layer.
 */
export interface Limit {
  /** bucket name, used as part of the key */
  name: string;
  max: number;
  windowMs: number;
}

interface Entry { count: number; resetAt: number }

const g = globalThis as unknown as { __samvaadRate?: Map<string, Entry> };
const store = (g.__samvaadRate ??= new Map<string, Entry>());

export interface RateResult { ok: boolean; remaining: number; retryAfterSec: number }

export function rateLimit(key: string, limit: Limit, now = Date.now()): RateResult {
  const k = `${limit.name}:${key}`;
  if (store.size > 5000) {
    for (const [kk, e] of store) if (e.resetAt <= now) store.delete(kk); // opportunistic cleanup keeps memory bounded
    if (store.size > 20000) store.clear(); // hard bound against key-flooding
  }
  let e = store.get(k);
  if (!e || e.resetAt <= now) {
    e = { count: 0, resetAt: now + limit.windowMs };
    store.set(k, e);
  }
  e.count++;
  const retryAfterSec = Math.max(1, Math.ceil((e.resetAt - now) / 1000));
  return { ok: e.count <= limit.max, remaining: Math.max(0, limit.max - e.count), retryAfterSec };
}

export function resetRateLimits() {
  store.clear();
}

export const LIMITS = {
  /** every authenticated request */
  general: { name: "general", max: 600, windowMs: 60_000 },
  /** every state-changing request */
  mutation: { name: "mutation", max: 180, windowMs: 60_000 },
  /** paid / expensive generation endpoints */
  ai: { name: "ai", max: 12, windowMs: 60_000 },
  /** sign-in attempts per client */
  signIn: { name: "signin", max: 20, windowMs: 60_000 },
  /** exports */
  export: { name: "export", max: 20, windowMs: 60_000 },
} as const satisfies Record<string, Limit>;

/** Maximum JSON body the API will read. Observations and reports are short text; 256 KiB is generous. */
export const MAX_BODY_BYTES = 256 * 1024;
