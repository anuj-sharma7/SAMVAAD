/**
 * A tiny separate database that remembers WHICH accounts have data on this device and how much of it is still unsynced
 * (a number only: no record content). It lets the app open the right account's data while offline, and lets the sign-out
 * button warn before someone leaves records behind. It holds nothing sensitive: id, display name, role, a count and a time.
 */
const NAME = "samvaad-registry";

export interface RegistryAccount { id: string; displayName: string; role: string; pending: number; lastSeenAt: string }

function open(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("accounts", { keyPath: "id" });
      req.result.createObjectStore("state", { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
const wrap = <T,>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

async function withDb<T>(factory: IDBFactory | undefined, fn: (db: IDBDatabase) => Promise<T>, fallback: T): Promise<T> {
  try {
    const f = factory ?? (typeof indexedDB === "undefined" ? undefined : indexedDB);
    if (!f) return fallback;
    const db = await open(f);
    try { return await fn(db); } finally { db.close(); }
  } catch {
    return fallback; // storage unavailable: the app still works online, it just cannot warn about local data
  }
}

export const registry = {
  async setLast(acc: Omit<RegistryAccount, "pending" | "lastSeenAt"> & { pending?: number }, factory?: IDBFactory) {
    await withDb(factory, async (db) => {
      const tx = db.transaction(["accounts", "state"], "readwrite");
      const existing = (await wrap(tx.objectStore("accounts").get(acc.id))) as RegistryAccount | undefined;
      tx.objectStore("accounts").put({ id: acc.id, displayName: acc.displayName, role: acc.role, pending: acc.pending ?? existing?.pending ?? 0, lastSeenAt: new Date().toISOString() });
      tx.objectStore("state").put({ key: "last", value: acc.id });
      await new Promise<void>((res) => { tx.oncomplete = () => res(); });
    }, undefined);
  },
  async getLast(factory?: IDBFactory): Promise<RegistryAccount | null> {
    return withDb(factory, async (db) => {
      const tx = db.transaction(["accounts", "state"], "readonly");
      const last = (await wrap(tx.objectStore("state").get("last"))) as { value: string } | undefined;
      if (!last) return null;
      return ((await wrap(tx.objectStore("accounts").get(last.value))) as RegistryAccount | undefined) ?? null;
    }, null);
  },
  async setPending(id: string, pending: number, factory?: IDBFactory) {
    await withDb(factory, async (db) => {
      const tx = db.transaction(["accounts"], "readwrite");
      const acc = (await wrap(tx.objectStore("accounts").get(id))) as RegistryAccount | undefined;
      if (acc) tx.objectStore("accounts").put({ ...acc, pending });
      await new Promise<void>((res) => { tx.oncomplete = () => res(); });
    }, undefined);
  },
  async getPending(id: string, factory?: IDBFactory): Promise<number> {
    return withDb(factory, async (db) => ((await wrap(db.transaction("accounts").objectStore("accounts").get(id))) as RegistryAccount | undefined)?.pending ?? 0, 0);
  },
  async list(factory?: IDBFactory): Promise<RegistryAccount[]> {
    return withDb(factory, (db) => wrap(db.transaction("accounts").objectStore("accounts").getAll()) as Promise<RegistryAccount[]>, []);
  },
};
