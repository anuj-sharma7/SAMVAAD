/**
 * npm run data:ingest
 * Loads the validated public datasets from data/ into the app database (public_* tables).
 * Refuses to activate data that failed validation. Safe to re-run: identical data is a no-op.
 */
import { dbPath } from "../../src/lib/db";
import { openDatabase } from "../../src/lib/db/client";
import { ingestPublicData } from "../../src/lib/data-sources/ingest";

const db = openDatabase(dbPath());
const r = ingestPublicData(db);
console.log(`${r.status.toUpperCase()}: ${r.detail} (rows=${r.rows}, active sources=${r.sourcesActive})`);
db.close();
if (r.status === "rejected") process.exit(1);
