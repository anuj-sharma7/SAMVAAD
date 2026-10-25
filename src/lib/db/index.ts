import path from "node:path";
import { openDatabase, type Db } from "./client";
import { seedIfEmpty } from "./seed";
import { autoIngestIfEmpty } from "../data-sources/ingest";
import { autoKbIngest } from "../data-sources/kb-ingest";

export * from "./client";

const g = globalThis as unknown as { __samvaadDb?: Db };

export function dbPath(): string {
  return process.env.SAMVAAD_DB_PATH || path.join(process.cwd(), "data", "samvaad.db");
}

/** The app-wide database. Opened lazily; seeded with fictional demo data on first run in demo mode. */
export function getDb(): Db {
  if (!g.__samvaadDb) {
    const db = openDatabase(dbPath());
    seedIfEmpty(db);
    autoIngestIfEmpty(db); // real public data: loaded once from data/ when the tables are empty
    autoKbIngest(db); // official-source knowledge base: imported as pending_review / draft only
    g.__samvaadDb = db;
  }
  return g.__samvaadDb;
}

/** Test hook: install a database as the app singleton. */
export function setDbForTests(db: Db | undefined) {
  g.__samvaadDb = db;
}
