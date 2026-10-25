import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { MIGRATIONS } from "./migrations";

export type Db = DatabaseSync;
type SqlParam = string | number | null | bigint | Uint8Array;

/** Open a database, enable integrity features and apply pending migrations. */
export function openDatabase(file: string): Db {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  migrate(db);
  return db;
}

export function migrate(db: Db): string[] {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  const applied = new Set(
    (db.prepare("SELECT id FROM schema_migrations").all() as { id: string }[]).map((r) => r.id),
  );
  const ran: string[] = [];
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    transaction(db, () => {
      db.exec(m.sql);
      db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(
        m.id,
        new Date().toISOString(),
      );
    });
    ran.push(m.id);
  }
  return ran;
}

/** Run `fn` atomically. node:sqlite is synchronous, so this is a plain BEGIN/COMMIT wrapper. */
export function transaction<T>(db: Db, fn: () => T): T {
  if (db.isTransaction) return fn(); // already inside one: join it
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/** node:sqlite returns null-prototype rows; React cannot pass those to Client Components, so every row is copied to a plain object. */
const plain = <T>(row: unknown): T => ({ ...(row as object) }) as T;

export function all<T>(db: Db, sql: string, ...params: SqlParam[]): T[] {
  return db.prepare(sql).all(...params).map((r) => plain<T>(r));
}
export function get<T>(db: Db, sql: string, ...params: SqlParam[]): T | undefined {
  const row = db.prepare(sql).get(...params);
  return row === undefined ? undefined : plain<T>(row);
}
export function run(db: Db, sql: string, ...params: SqlParam[]) {
  return db.prepare(sql).run(...params);
}

export { nowIso, newId, parseJson } from '../util';
