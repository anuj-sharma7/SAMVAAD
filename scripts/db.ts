/**
 * Database helper.
 *   npm run db:seed    create the schema (if needed) and load fictional demo data when the DB is empty
 *   npm run db:reset   DELETE the local database file and recreate it with fresh demo data
 */
import fs from "node:fs";
import { dbPath } from "../src/lib/db";
import { openDatabase } from "../src/lib/db/client";
import { seedDemoData } from "../src/lib/db/seed";

const cmd = process.argv[2];
const file = dbPath();

if (cmd === "reset") {
  for (const f of [file, `${file}-wal`, `${file}-shm`]) {
    if (fs.existsSync(f)) fs.rmSync(f);
  }
  console.log(`Deleted ${file}`);
}

if (cmd === "reset" || cmd === "seed") {
  const db = openDatabase(file);
  const row = db.prepare("SELECT count(*) AS n FROM profiles").get() as { n: number };
  if (row.n === 0) {
    seedDemoData(db);
    console.log("Loaded fictional demo data (schools, visits, practice cards).");
  } else {
    console.log("Database already contains data; nothing seeded. Use `npm run db:reset` to start over.");
  }
  db.close();
  console.log(`Database ready at ${file}`);
} else {
  console.error("Usage: tsx scripts/db.ts <seed|reset>");
  process.exit(1);
}
