import { StorageError } from "./types";

/**
 * One IndexedDB database PER ACCOUNT (`samvaad-offline--<accountId>`). Another account signing in on the same device opens a
 * different database, so it can never read or sync this account's records, and this account's unsynced work is never deleted by
 * someone else signing in.
 *
 * Versioning: `MIGRATIONS` is append-only. Each step runs inside IndexedDB's upgrade transaction, so a step that throws rolls the
 * whole upgrade back and the database stays at its previous version with all records (including the outbox) intact.
 */
export const DB_VERSION = 2;
export const STORES = ["meta", "schools", "cards", "visits", "observations", "commitments", "outbox", "conflicts", "syncLog"] as const;

export type Migration = { version: number; up: (db: IDBDatabase, tx: IDBTransaction) => void };

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up(db) {
      db.createObjectStore("meta", { keyPath: "key" });
      db.createObjectStore("schools", { keyPath: "id" });
      db.createObjectStore("cards", { keyPath: "id" });
      const visits = db.createObjectStore("visits", { keyPath: "id" });
      visits.createIndex("byStatus", "status");
      const obs = db.createObjectStore("observations", { keyPath: "id" });
      obs.createIndex("byVisit", "visit_id");
      const com = db.createObjectStore("commitments", { keyPath: "id" });
      com.createIndex("byVisit", "visit_id");
      const outbox = db.createObjectStore("outbox", { keyPath: "seq", autoIncrement: true });
      outbox.createIndex("byOpId", "opId", { unique: true });
      outbox.createIndex("byEntity", "entityId");
      outbox.createIndex("byStatus", "status");
      db.createObjectStore("conflicts", { keyPath: "id" });
    },
  },
  {
    // v2: minimal sync history (no record text) and a school index on visits. Existing outbox entries are untouched.
    version: 2,
    up(db, tx) {
      db.createObjectStore("syncLog", { keyPath: "id", autoIncrement: true });
      tx.objectStore("visits").createIndex("bySchool", "school_id");
    },
  },
];

export const dbNameFor = (accountId: string) => `samvaad-offline--${accountId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80)}`;

export function openDb(name: string, migrations: Migration[] = MIGRATIONS, factory: IDBFactory = indexedDB): Promise<IDBDatabase> {
  const target = Math.max(...migrations.map((m) => m.version));
  return new Promise((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = factory.open(name, target);
    } catch (e) {
      reject(new StorageError("unavailable", "Local storage is not available in this browser.", e));
      return;
    }
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      const tx = req.transaction!;
      try {
        for (const m of migrations) if (m.version > ev.oldVersion) m.up(db, tx);
      } catch (e) {
        // Aborting the upgrade transaction leaves the database exactly as it was before (old version, all records intact).
        try { tx.abort(); } catch { /* ignore */ }
        reject(new StorageError("migration", "The saved data could not be upgraded. Your records on this device were not changed.", e));
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close(); // let a newer app version upgrade the database instead of blocking it
      resolve(db);
    };
    req.onerror = () => {
      const err = req.error;
      reject(err?.name === "AbortError" ? new StorageError("migration", "The saved data could not be upgraded. Your records on this device were not changed.", err) : new StorageError("unavailable", "Local storage is not available.", err));
    };
    req.onblocked = () => reject(new StorageError("migration", "Close other SAMVAAD tabs, then try again.", null));
  });
}

export function deleteDb(name: string, factory: IDBFactory = indexedDB): Promise<void> {
  return new Promise((resolve, reject) => {
    const r = factory.deleteDatabase(name);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new StorageError("unavailable", "Close other SAMVAAD tabs, then try again.", null));
  });
}
