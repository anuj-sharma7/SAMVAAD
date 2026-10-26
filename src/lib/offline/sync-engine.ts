import type { LocalStore } from "./store";
import type { Snapshot } from "./types";

/**
 * Client side of the sync protocol (docs/OFFLINE_SYNC_PROTOCOL.md).
 *
 * Guarantees:
 *  - an operation leaves the outbox only after the server answered "applied" or "duplicate" for that operation;
 *  - one rejected / conflicting operation never marks the others as synced, and never blocks other visits;
 *  - a retry after a lost response is safe because the server de-duplicates by operation id;
 *  - nothing is sent for another account, and nothing is deleted locally when the session expires.
 */
export type TransportErrorKind = "network" | "auth" | "rate" | "server" | "client";
export class TransportError extends Error {
  constructor(public kind: TransportErrorKind, public status?: number, public code?: string, public retryAfterMs?: number) {
    super(`${kind}${status ? ` ${status}` : ""}${code ? ` ${code}` : ""}`);
    this.name = "TransportError";
  }
}

export interface WireOp {
  op_id: string; entity_type: string; entity_id: string; op: string; payload: Record<string, unknown>;
  expected_updated_at?: string; created_at: string; schema_version: 1;
}
export interface WireResult {
  op_id: string; status: string; server_version?: string; server_record?: Record<string, unknown>; code?: string; message?: string;
}
export interface Transport {
  me(): Promise<{ id: string }>;
  push(accountId: string, ops: WireOp[]): Promise<{ results: WireResult[]; server_time: string }>;
  snapshot(): Promise<Snapshot>;
}

export type SyncStatus = "ok" | "partial" | "offline" | "auth_expired" | "account_mismatch" | "busy" | "nothing";
export interface SyncReport {
  status: SyncStatus;
  applied: number; duplicates: number; conflicts: number; rejected: number; skipped: number; failed: number;
  pulled: boolean;
  at: string;
}

export const MAX_BATCH = 25;
const MAX_BATCHES = 20;

/** Bounded exponential backoff with jitter: ~2s, 4s, 8s … capped at 5 minutes. */
export function backoffMs(retry: number, random: () => number = Math.random): number {
  const base = Math.min(300_000, 2_000 * 2 ** Math.max(0, retry - 1));
  return Math.round(base * (0.5 + random() * 0.5));
}

const running = new Map<string, Promise<unknown>>();

/** One sync at a time per account (in this tab via a map, across tabs via the Web Locks API when the browser has it). */
async function exclusive<T>(accountId: string, fn: () => Promise<T>, busy: T): Promise<T> {
  if (running.has(accountId)) return busy;
  const run = (async () => {
    const locks = (globalThis.navigator as Navigator | undefined)?.locks;
    if (locks?.request) {
      const r = await locks.request(`samvaad-sync-${accountId}`, { ifAvailable: true }, async (lock) => (lock ? { value: await fn() } : null));
      return r ? r.value : busy;
    }
    return fn();
  })();
  running.set(accountId, run);
  try {
    return await run;
  } finally {
    running.delete(accountId);
  }
}

export async function runSync(
  store: LocalStore,
  transport: Transport,
  opts: { now?: () => Date; manual?: boolean; random?: () => number; pull?: boolean } = {},
): Promise<SyncReport> {
  const now = opts.now ?? (() => new Date());
  const report: SyncReport = { status: "nothing", applied: 0, duplicates: 0, conflicts: 0, rejected: 0, skipped: 0, failed: 0, pulled: false, at: now().toISOString() };
  const retryAt = (retry: number) => new Date(now().getTime() + backoffMs(retry, opts.random)).toISOString();

  return exclusive(store.accountId, async () => {
    await store.resetInflight();

    // 1. Who is signed in right now? Never push one account's queue under another session.
    try {
      const me = await transport.me();
      if (me.id !== store.accountId) return { ...report, status: "account_mismatch" };
    } catch (e) {
      const kind = e instanceof TransportError ? e.kind : "network";
      return { ...report, status: kind === "auth" ? "auth_expired" : "offline" };
    }

    // 2. Push, oldest first, in bounded batches.
    let transportFailed = false;
    for (let i = 0; i < MAX_BATCHES; i++) {
      const batch = await store.nextBatch(now(), !!opts.manual, MAX_BATCH);
      if (batch.length === 0) break;
      const sent = batch.map((b) => b.op);
      const wire: WireOp[] = batch.map(({ op, expected }) => ({
        op_id: op.opId, entity_type: op.entityType, entity_id: op.entityId, op: op.op, payload: op.payload,
        ...(expected ? { expected_updated_at: expected } : {}), created_at: op.createdAt, schema_version: 1,
      }));
      await store.markInflight(sent.map((o) => o.opId), now().toISOString());
      let resp: { results: WireResult[] };
      try {
        resp = await transport.push(store.accountId, wire);
      } catch (e) {
        const te = e instanceof TransportError ? e : new TransportError("network");
        if (te.kind === "auth") {
          await store.releaseInflight(sent.map((o) => o.opId));
          return { ...report, status: "auth_expired" };
        }
        const code = te.kind === "network" ? "network" : te.kind === "rate" ? "rate_limited" : te.kind === "client" ? "bad_request" : "server_error";
        const retry = Math.max(...sent.map((o) => o.retryCount)) + 1;
        const next = te.retryAfterMs ? new Date(now().getTime() + te.retryAfterMs).toISOString() : retryAt(retry);
        await store.markFailed(sent.map((o) => o.opId), code, next);
        report.failed += sent.length;
        transportFailed = true;
        break;
      }
      const t = await store.applyResults(sent, resp.results, retryAt);
      report.applied += t.applied; report.duplicates += t.duplicates; report.conflicts += t.conflicts;
      report.rejected += t.rejected; report.skipped += t.skipped; report.failed += t.failed;
      if (t.applied + t.duplicates === 0) break; // no progress: do not loop on items that need the user
    }

    // 3. Pull the latest server state (refreshes confirmed records and cached cards; never overwrites unsent local changes).
    if (opts.pull !== false) {
      try {
        await store.applySnapshot(await transport.snapshot());
        report.pulled = true;
      } catch (e) {
        if (e instanceof TransportError && e.kind === "auth") return { ...report, status: "auth_expired" };
      }
    }

    if (!transportFailed && report.failed === 0) await store.setLastSync(now().toISOString());
    const summary = await store.syncSummary();
    // ok = nothing left waiting; partial = some work is still waiting (retry later, or it needs the user); offline = nothing got through.
    const progressed = report.applied + report.duplicates > 0;
    const status: SyncStatus = transportFailed ? (progressed ? "partial" : "offline") : summary.pendingOps > 0 ? "partial" : progressed ? "ok" : "nothing";
    return { ...report, status, at: now().toISOString() };
  }, { ...report, status: "busy" as SyncStatus });
}
