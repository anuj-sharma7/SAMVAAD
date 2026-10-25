import { describe, expect, it, beforeAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { all, get } from "@/lib/db/client";
import { freshDb, asha, meena, ishaan } from "./helpers";
import { ingestPublicData } from "@/lib/data-sources/ingest";
import { parseCsv, parseCsvObjects } from "@/lib/data-sources/csv";
import { freshness, getSource, listSources, sourceQuality, valuesFor, stateSnapshot, listIndicatorDefs } from "@/lib/services/public-context";
import { listAudit } from "@/lib/services/audit";
import { sigOk, csvCell } from "../scripts/data/lib";

const REAL = path.join(process.cwd(), "data");
const hasRealData = fs.existsSync(path.join(REAL, "processed", "indicators_long.csv"));

/** Copy the real data directory into a temp dir so tests can tamper with it safely. */
function tempCopy(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "samvaad-data-"));
  for (const f of ["source_registry.csv", "processed/indicators_long.csv", "processed/indicator_definitions.csv", "reports/data_quality.json", "metadata/dataset_manifest.json"]) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.copyFileSync(path.join(REAL, f), path.join(dir, f));
  }
  return dir;
}

describe.skipIf(!hasRealData)("public data: ingestion safety", () => {
  it("imports the validated set, records provenance and audit events, and is idempotent", () => {
    const db = freshDb(false);
    const first = ingestPublicData(db, REAL);
    expect(first.status).toBe("imported");
    expect(first.rows).toBeGreaterThan(3000);
    const n1 = get<{ n: number }>(db, "SELECT count(*) AS n FROM public_indicators")!.n;

    const second = ingestPublicData(db, REAL);
    expect(second.status).toBe("unchanged");
    expect(get<{ n: number }>(db, "SELECT count(*) AS n FROM public_indicators")!.n).toBe(n1); // no double counting
    expect(get<{ n: number }>(db, "SELECT count(*) AS n FROM public_ingestions")!.n).toBe(1);

    const actions = all<{ action: string }>(db, "SELECT action FROM audit_logs WHERE resource_type IN ('public_dataset','public_source')").map((a) => a.action);
    expect(actions).toContain("dataset.imported");
    expect(actions.filter((a) => a === "dataset.activated").length).toBe(first.sourcesActive);
  });

  it("rejects (and keeps the previous data) when the validation report has a failure", () => {
    const db = freshDb(false);
    ingestPublicData(db, REAL);
    const before = get<{ n: number }>(db, "SELECT count(*) AS n FROM public_indicators")!.n;
    const dir = tempCopy();
    const q = JSON.parse(fs.readFileSync(path.join(dir, "reports/data_quality.json"), "utf8"));
    q.failures = ["UDISE+: totals mismatch"];
    q.checks[0].ok = false;
    fs.writeFileSync(path.join(dir, "reports/data_quality.json"), JSON.stringify(q));
    const r = ingestPublicData(db, dir);
    expect(r.status).toBe("rejected");
    expect(r.detail).toMatch(/failed check/);
    expect(get<{ n: number }>(db, "SELECT count(*) AS n FROM public_indicators")!.n).toBe(before);
    expect(all<{ action: string }>(db, "SELECT action FROM audit_logs").some((a) => a.action === "dataset.rejected")).toBe(true);
  });

  it("rejects a processed file that changed after validation (checksum mismatch)", () => {
    const db = freshDb(false);
    const dir = tempCopy();
    const f = path.join(dir, "processed/indicators_long.csv");
    fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("udise_schools_total", "udise_schools_total ").replace(/\n$/, "\n"));
    const r = ingestPublicData(db, dir);
    expect(r.status).toBe("rejected");
    expect(r.detail).toMatch(/checksum/);
    expect(get<{ n: number }>(db, "SELECT count(*) AS n FROM public_indicators")!.n).toBe(0);
  });

  it("rejects when files are missing instead of inventing data", () => {
    const db = freshDb(false);
    const r = ingestPublicData(db, path.join(os.tmpdir(), "does-not-exist-samvaad"));
    expect(r.status).toBe("rejected");
    expect(r.detail).toMatch(/missing/);
    expect(listIndicatorDefs(db)).toHaveLength(0);
  });

  it("refuses rows that are not backed by a validated source", () => {
    const db = freshDb(false);
    const dir = tempCopy();
    // mark the UDISE booklet as blocked in the registry but leave its rows in place
    const reg = path.join(dir, "source_registry.csv");
    const original = fs.readFileSync(reg, "utf8");
    const edited = original.split("\n").map((l) => (l.startsWith("udise_2024_25_booklet,") ? l.replace(",downloaded_and_validated,", ",manual_download_needed,") : l)).join("\n");
    expect(edited).not.toBe(original); // the change really happened
    fs.writeFileSync(reg, edited);
    const r = ingestPublicData(db, dir);
    expect(r.status).toBe("rejected");
    expect(r.detail).toMatch(/not backed by a validated source/);
  });
});

describe.skipIf(!hasRealData)("public data: provenance, values and separation", () => {
  let db: ReturnType<typeof freshDb>;
  beforeAll(() => {
    db = freshDb(true); // demo operational data + public data side by side
    ingestPublicData(db, REAL);
  });

  it("every indicator value links to an active source with a URL, period and locator", () => {
    const orphan = get<{ n: number }>(db, `SELECT count(*) AS n FROM public_indicators i LEFT JOIN public_sources s ON s.source_id = i.source_id
        WHERE s.source_id IS NULL OR s.is_active = 0 OR s.source_url = '' OR s.reference_period = '' OR i.source_locator = ''`)!.n;
    expect(orphan).toBe(0);
    const bad = get<{ n: number }>(db, "SELECT count(*) AS n FROM public_sources WHERE is_active = 1 AND access_status <> 'downloaded_and_validated'")!.n;
    expect(bad).toBe(0);
  });

  it("matches numbers printed in the source documents themselves", () => {
    const v = (id: string, o: Parameters<typeof valuesFor>[2]) => valuesFor(db, id, o);
    // UDISE+ 2024-25 booklet, Table 2.2 (national row) and the deck's cited 63.5% internet share
    expect(v("udise_schools_total", { level: "national" })[0].value).toBe(1471473);
    expect(v("udise_enrolment_total", { level: "national" })[0].value).toBe(246932680);
    expect(v("udise_teachers_total", { level: "national" })[0].value).toBe(10122420);
    expect(v("udise_infra_internet_share", { level: "national" })[0].value).toBeCloseTo(63.5, 1);
    // ASER 2024 Rajasthan district table (Ajmer row and state row)
    const ajmer = v("aser_enrol_govt_6_14", { level: "district", state: "Rajasthan" }).find((r) => r.area === "Ajmer");
    expect(ajmer?.value).toBe(66.9);
    expect(v("aser_std3_5_read_std2", { level: "district", state: "Rajasthan" }).find((r) => r.area === "Ajmer")?.value).toBe(32.5);
    expect(v("aser_std3_5_read_std2", { level: "state", state: "Rajasthan", period: "ASER 2024" }).some((r) => r.value === 33.1)).toBe(true);
    // The divisional file's own worked example: Ajmer division 2024 = 37.7%, within 4.54 points
    const div = v("aser_std3_5_read_std2", { level: "division", state: "Rajasthan", period: "ASER 2024" }).find((r) => r.area === "Ajmer");
    expect(div?.value).toBe(37.7);
    expect(div?.ci95_half_width).toBeCloseTo(4.54, 2);
  });

  it("keeps suppressed districts as explicit 'not published', never zero", () => {
    const rows = valuesFor(db, "aser_std3_5_read_std2", { level: "district", state: "Uttarakhand" });
    const almora = rows.find((r) => r.area === "Almora");
    expect(almora).toBeDefined();
    expect(almora!.value).toBeNull();
    expect(almora!.value_status).toBe("suppressed");
    expect(almora!.notes).toMatch(/Data insufficient/);
  });

  it("reports reference periods and distinguishes survey years", () => {
    const periods = all<{ reference_period: string }>(db, "SELECT DISTINCT reference_period FROM public_indicators WHERE source_id LIKE '%divisional'").map((r) => r.reference_period).sort();
    expect(periods).toEqual(["ASER 2018", "ASER 2022", "ASER 2024"]);
    const snap = stateSnapshot(db, "Rajasthan");
    expect(snap.facts.every((f) => f.reference_period.startsWith("UDISE+ 2024-25"))).toBe(true);
  });

  it("separates real public data from operational demo records", () => {
    // no foreign keys from public tables into operational tables, or the other way round
    const pubFks = all<{ table: string }>(db, "SELECT m.name AS 'table' FROM sqlite_master m, pragma_foreign_key_list(m.name) f WHERE m.name LIKE 'public_%' AND f.\"table\" NOT LIKE 'public_%'");
    expect(pubFks).toHaveLength(0);
    const opFks = all<{ table: string }>(db, "SELECT m.name AS 'table' FROM sqlite_master m, pragma_foreign_key_list(m.name) f WHERE m.name NOT LIKE 'public_%' AND f.\"table\" LIKE 'public_%'");
    expect(opFks).toHaveLength(0);
    // fictional schools are not in any public geography and public rows hold no person-level fields
    const demoSchool = get<{ state: string }>(db, "SELECT state FROM schools LIMIT 1")!;
    expect(demoSchool.state).toBe("Demo State");
    expect(get<{ n: number }>(db, "SELECT count(*) AS n FROM public_indicators WHERE state = 'Demo State'")!.n).toBe(0);
    const cols = all<{ name: string }>(db, "SELECT name FROM pragma_table_info('public_indicators')").map((c) => c.name);
    expect(cols.some((c) => /teacher|student|child_name|mentor|visit|contact|phone|email/i.test(c))).toBe(false);
  });

  it("exposes freshness, quality and a complete catalogue including blocked sources", () => {
    const f = freshness(db);
    expect(f.lastSuccessful?.rows_imported).toBeGreaterThan(3000);
    expect(f.lastIngestion?.checks_passed).toBe(f.lastIngestion?.checks_total);
    const all_ = listSources(db);
    const statuses = new Set(all_.map((s) => s.access_status));
    for (const st of ["downloaded_and_validated", "manual_download_needed", "registration_or_request_required", "captcha_or_interaction_blocked", "unavailable"]) {
      expect(statuses.has(st)).toBe(true);
    }
    // blocked sources are listed with a reason, never as active
    for (const s of all_.filter((x) => x.access_status !== "downloaded_and_validated")) {
      expect(s.is_active).toBe(0);
      expect(s.access_detail ?? "").not.toBe("");
      expect(getSource(db, s.source_id).indicators).toBe(0);
    }
    const q = sourceQuality(db);
    expect(q.every((r) => r.completeness_pct >= 0 && r.completeness_pct <= 100)).toBe(true);
    expect(q.find((r) => r.source_id === "aser_2024_uttarakhand_district")!.suppressed).toBeGreaterThan(0);
  });

  it("every role can read public context; it adds no teacher-level output", () => {
    for (const a of [asha(db), meena(db), ishaan(db)]) {
      expect(a.id).toBeTruthy();
    }
    const defs = listIndicatorDefs(db);
    expect(defs.some((d) => /teacher (score|rank)|rating/i.test(d.label + d.description))).toBe(false);
    // the audit trail records the activation events for supervisors
    expect(listAudit(db, meena(db), { resourceType: "public_source", limit: 200 }).length).toBeGreaterThan(0);
  });
});

describe("download validation and CSV safety", () => {
  it("never treats HTML error/login/CAPTCHA pages or empty bodies as datasets", () => {
    const html = Buffer.from("<!DOCTYPE html><html><body>403 Forbidden</body></html>");
    expect(sigOk("pdf", html)).toBe(false);
    expect(sigOk("csv", html)).toBe(false);
    expect(sigOk("pdf", Buffer.alloc(0))).toBe(false);
    expect(sigOk("pdf", Buffer.from("%PDF-1.7\n..."))).toBe(true);
    expect(sigOk("csv", Buffer.from("state,value\nRajasthan,1\n"))).toBe(true);
  });

  it("parses RFC 4180 CSV safely (BOM, quotes, embedded newlines) and rejects ragged rows", () => {
    expect(parseCsv('﻿a,b\n"x, y","say ""hi"""\n')).toEqual([["a", "b"], ["x, y", 'say "hi"']]);
    expect(parseCsv('a,b\n"line1\nline2",2\r\n')[1][0]).toBe("line1\nline2");
    expect(() => parseCsvObjects("a,b\n1\n")).toThrow(/expected 2/);
  });

  it("neutralises spreadsheet formulas in written CSV but keeps real negative numbers", () => {
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("+1+1")).toBe("'+1+1");
    expect(csvCell(-3.5)).toBe("-3.5");
    expect(csvCell("-3.5")).toBe("-3.5");
  });
});
