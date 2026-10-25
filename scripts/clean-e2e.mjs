// Removes the throw-away e2e database so every browser-test run starts from fresh demo data.
import fs from "node:fs";
for (const f of ["./data/e2e.db", "./data/e2e.db-wal", "./data/e2e.db-shm"]) {
  if (fs.existsSync(f)) fs.rmSync(f);
}
