import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { all, get } from "@/lib/db/client";
import { freshDb } from "./helpers";
import { ingestPublicData, MAX_PROCESSED_ROWS } from "@/lib/data-sources/ingest";

const REAL = path.join(process.cwd(), "data");
const hasRealData = fs.existsSync(path.join(REAL, "processed", "indicators_long.csv"));

function tempCopy(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "samvaad-ingest-"));
  for (const f of ["source_registry.csv", "processed/indicators_long.csv", "processed/indicator_definitions.csv", "reports/data_quality.json", "metadata/dataset_manifest.json"]) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.copyFileSync(path.join(REAL, f), path.join(dir, f));
  }
  return dir;
}

/** Rewrite the processed file AND its manifest checksum, so the test reaches the content checks behind the checksum gate. */
function rewriteProcessed(dir: string, edit: (text: string) => string) {
  const file = path.join(dir, "processed/indicators_long.csv");
  const text = edit(fs.readFileSync(file, "utf8"));
  fs.writeFileSync(file, text);
  const mf = path.join(dir, "metadata/dataset_manifest.json");
  const m = JSON.parse(fs.readFileSync(mf, "utf8"));
  m.processed_files.find((f: { file: string }) => f.file.endsWith("indicators_long.csv")).sha256 = crypto.createHash("sha256").update(text).digest("hex");
  fs.writeFileSync(mf, JSON.stringify(m));
}

const counts = (db: ReturnType<typeof freshDb>) => ({
  rows: get<{ n: number }>(db, "SELECT count(*) AS n FROM public_indicators")!.n,
  defs: get<{ n: number }>(db, "SELECT count(*) AS n FROM public_indicator_defs")!.n,
  sources: get<{ n: number }>(db, "SELECT count(*) AS n FROM public_sources")!.n,
});

describe.skipIf(!hasRealData)("public data ingest: malformed and hostile input", () => {
  const cases: [string, (t: string) => string, RegExp][] = [
    ["empty file", () => "", /missing|no data rows|checksum/],
    ["header only (no rows)", (t) => t.split("\n")[0] + "\n", /no data rows/],
    ["missing required column", (t) => t.replace(/^indicator_id,/, "indicator_ident,"), /could not be parsed/],
    ["ragged row", (t) => t.replace("\n", ",extra\n"), /could not be parsed/],
    ["non-numeric value", (t) => t.replace(/(\n[^\n]*?,reported,)/, "$1").replace(/,(reported|derived),/, ",$1,").replace(/\d+(\.\d+)?,(\d*(\.\d+)?),reported/, "abc,$2,reported"), /could not be parsed/],
    ["NaN/Infinity value", (t) => t.replace(/\d+(\.\d+)?,(\d*(\.\d+)?),reported/, "Infinity,$2,reported"), /could not be parsed/],
    ["negative confidence interval", (t) => t.replace(/\d+(\.\d+)?,(\d*(\.\d+)?),reported/, "5,-1,reported"), /could not be parsed/],
    ["oversized text field", (t) => t.replace(/\nudise_/, "\n" + "x".repeat(300) + "udise_"), /could not be parsed|not backed/],
    ["invalid UTF-8 / replacement characters", (t) => t + "�\n", /invalid UTF-8/],
    ["NUL byte", (t) => t + "\u0000", /NUL|invalid UTF-8/],
    ["duplicate row (double counting)", (t) => { const l = t.split("\n"); return [...l.slice(0, -1), l[1], ""].join("\n"); }, /Duplicate row/],
    ["unknown source id", (t) => t.replace(/\n([^,\n]+),udise_2024_25_booklet,/, "\n$1,not_a_registered_source,"), /not backed by a validated source/],
    ["unknown geography level", (t) => t.replace(",state,", ",planet,"), /could not be parsed/],
  ];

  it.each(cases)("rejects %s and leaves existing data untouched", (name, edit, why) => {
    const db = freshDb(false);
    expect(ingestPublicData(db, REAL).status).toBe("imported");
    const before = counts(db);
    const dir = tempCopy();
    const original = fs.readFileSync(path.join(dir, "processed/indicators_long.csv"), "utf8");
    rewriteProcessed(dir, edit);
    expect(fs.readFileSync(path.join(dir, "processed/indicators_long.csv"), "utf8")).not.toBe(original); // the tamper really happened
    const r = ingestPublicData(db, dir);
    expect(r.status).toBe("rejected");
    expect(r.detail).toMatch(why);
    expect(counts(db)).toEqual(before);
    expect(all<{ action: string }>(db, "SELECT action FROM audit_logs").some((a) => a.action === "dataset.rejected")).toBe(true);
  });

  it("rejects an oversized file by byte limit before parsing it", () => {
    const db = freshDb(false);
    const dir = tempCopy();
    rewriteProcessed(dir, (t) => t + "x".repeat(21 * 1024 * 1024));
    const r = ingestPublicData(db, dir);
    expect(r.status).toBe("rejected");
    expect(r.detail).toMatch(/import limit/);
    expect(counts(db).rows).toBe(0);
  });

  it("rejects more rows than the row limit", () => {
    expect(MAX_PROCESSED_ROWS).toBeGreaterThan(4000); // real data fits comfortably
    const db = freshDb(false);
    const dir = tempCopy();
    rewriteProcessed(dir, (t) => {
      const [head, first] = t.split("\n");
      // distinct areas so the duplicate check does not fire first
      return [head, ...Array.from({ length: MAX_PROCESSED_ROWS + 1 }, (_, i) => first.replace(/^([^,]*,[^,]*,[^,]*,[^,]*,)[^,]*/, `$1area${i}`))].join("\n") + "\n";
    });
    const r = ingestPublicData(db, dir);
    expect(r.status).toBe("rejected");
    expect(r.detail).toMatch(/limit/);
  });

  it("a failure in the middle of the import rolls everything back (old data stays, nothing half-written)", () => {
    const db = freshDb(false);
    ingestPublicData(db, REAL);
    const before = counts(db);
    const dir = tempCopy();
    // definitions are not covered by the checksum gate; a duplicated primary key fails mid-transaction after the DELETEs ran
    const defs = path.join(dir, "processed/indicator_definitions.csv");
    const lines = fs.readFileSync(defs, "utf8").split("\n");
    fs.writeFileSync(defs, [...lines.slice(0, -1), lines[1], ""].join("\n"));
    // change the registry hash so the "identical input" short-circuit does not apply
    fs.appendFileSync(path.join(dir, "source_registry.csv"), "\n");
    const r = ingestPublicData(db, dir);
    expect(r.status).toBe("rejected");
    expect(r.detail).toMatch(/rolled back/);
    expect(counts(db)).toEqual(before);
  });

  it("re-running an identical import never duplicates rows, and a changed-but-valid import replaces rather than appends", () => {
    const db = freshDb(false);
    ingestPublicData(db, REAL);
    const n = counts(db);
    expect(ingestPublicData(db, REAL).status).toBe("unchanged");
    const dir = tempCopy();
    fs.appendFileSync(path.join(dir, "source_registry.csv"), "\n");
    const r = ingestPublicData(db, dir);
    expect(["imported", "unchanged", "rejected"]).toContain(r.status);
    if (r.status === "imported") expect(counts(db)).toEqual(n);
  });
});
