import { StorageError } from "./types";

/** Small promise helpers over the raw IndexedDB API (no dependency). */
export const wrap = <T,>(r: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

export function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new DOMException("Transaction aborted", "AbortError"));
  });
}

const isDomError = (e: unknown) => typeof DOMException !== "undefined" && e instanceof DOMException;

/** Only genuine browser storage failures become StorageError. Rule/validation errors thrown by our own code pass through unchanged. */
export function toStorageError(err: unknown): StorageError {
  if (err instanceof StorageError) return err;
  const name = (err as { name?: string })?.name;
  if (name === "QuotaExceededError") return new StorageError("quota", "This device has no storage space left for SAMVAAD records.", err);
  if (name === "VersionError" || name === "UpgradeError") return new StorageError("migration", "The saved data could not be upgraded.", err);
  return new StorageError("unavailable", "This device could not save the record.", err);
}

/**
 * Run `fn` inside ONE transaction over `stores` and resolve only after the transaction has committed. If anything fails the
 * whole transaction rolls back, so a record and its outbox entry are saved together or not at all.
 * `fn` must only await IndexedDB requests (a foreign promise would let the transaction auto-commit early).
 */
export async function inTx<T>(db: IDBDatabase, stores: string[], mode: IDBTransactionMode, fn: (tx: IDBTransaction) => Promise<T>): Promise<T> {
  let tx: IDBTransaction;
  try {
    tx = db.transaction(stores, mode);
  } catch (e) {
    throw toStorageError(e);
  }
  const done = txDone(tx);
  let value: T;
  try {
    value = await fn(tx);
  } catch (e) {
    try { tx.abort(); } catch { /* already finished */ }
    await done.catch(() => undefined);
    throw isDomError(e) || e instanceof StorageError ? toStorageError(e) : e;
  }
  try {
    await done;
  } catch (e) {
    throw toStorageError(e);
  }
  return value;
}

export function uuid(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  // Non-secure contexts (plain http on a LAN address) have no randomUUID: build a v4 UUID from getRandomValues.
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
