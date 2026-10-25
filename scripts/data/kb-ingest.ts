/**
 * npm run kb:ingest
 * Imports the source-backed knowledge base (excerpts + card drafts) into the app database as PENDING REVIEW.
 * Nothing becomes usable for coaching until a curator approves it in the app.
 */
import { dbPath } from "../../src/lib/db";
import { openDatabase } from "../../src/lib/db/client";
import { ingestKnowledgeBase } from "../../src/lib/data-sources/kb-ingest";

const db = openDatabase(dbPath());
const r = ingestKnowledgeBase(db);
console.log(`${r.status.toUpperCase()}: ${r.detail}`);
db.close();
if (r.status === "rejected") process.exit(1);
