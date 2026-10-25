/**
 * npm run data:validate
 * Re-reads data/processed/*.csv (not the parser's memory) and checks structure, arithmetic, cross-file consistency,
 * duplicates, ranges and coverage. Writes data/reports/data_quality.json and exits non-zero on any failure.
 */
import fs from "node:fs";
import path from "node:path";
import { PROCESSED, REPORTS, parseCsv, writeJson, nowIso } from "./lib";
import { INDICATOR_COLUMNS, INDICATOR_DEFS, STATES } from "./schema";
import { pdfPages } from "./lib";
import { RAW } from "./lib";

type Row = Record<string, string>;
const failures: string[] = [];
const warnings: string[] = [];
const checks: { name: string; ok: boolean; detail: string }[] = [];

function check(name: string, ok: boolean, detail: string) {
  checks.push({ name, ok, detail });
  if (!ok) failures.push(`${name}: ${detail}`);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + detail}`);
}

function load(): Row[] {
  const file = path.join(PROCESSED, "indicators_long.csv");
  const parsed = parseCsv(fs.readFileSync(file, "utf8"));
  const header = parsed[0];
  check("schema: header matches", JSON.stringify(header) === JSON.stringify(INDICATOR_COLUMNS), `got ${header.join(",")}`);
  return parsed.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

const val = (r: Row) => (r.value === "" ? null : Number(r.value));

async function main() {
  const rows = load();
  check("rows: not empty", rows.length > 0, "no rows");

  // ---- structural --------------------------------------------------------------------------------------
  const defIds = new Set(INDICATOR_DEFS.map((d) => d.indicator_id));
  const unknown = [...new Set(rows.filter((r) => !defIds.has(r.indicator_id)).map((r) => r.indicator_id))];
  check("every indicator has a definition", unknown.length === 0, unknown.join(", "));
  const key = (r: Row) => [r.indicator_id, r.source_id, r.state, r.area, r.reference_period].join("|");
  const dupList = rows.map(key).filter((k, i, a) => a.indexOf(k) !== i);
  check("no duplicate (indicator, source, geography, period) rows", dupList.length === 0, `${dupList.length} duplicates, e.g. ${dupList[0]}`);
  const badStatus = rows.filter((r) => !["reported", "derived", "suppressed"].includes(r.value_status));
  check("value_status is one of reported/derived/suppressed", badStatus.length === 0, `${badStatus.length} rows`);
  const nullNotSuppressed = rows.filter((r) => (r.value === "") !== (r.value_status === "suppressed"));
  check("missing values are marked suppressed (never zero-filled)", nullNotSuppressed.length === 0, `${nullNotSuppressed.length} rows`);
  const noProv = rows.filter((r) => !r.source_id || !r.source_locator || !r.reference_period);
  check("every row has source_id, locator and reference period", noProv.length === 0, `${noProv.length} rows`);

  // ---- UDISE+ ------------------------------------------------------------------------------------------
  const u = rows.filter((r) => r.source_id === "udise_2024_25_booklet");
  const get = (id: string, state: string) => val(u.find((r) => r.indicator_id === id && r.state === state && r.geography_level === (state ? "state" : "national"))!);
  const states = [...new Set(u.filter((r) => r.geography_level === "state").map((r) => r.state))];
  check("UDISE+: 36 states/UTs + India present", states.length === STATES.length && STATES.every((s) => states.includes(s)) && u.some((r) => r.geography_level === "national"), `${states.length} states`);
  for (const id of ["udise_schools_total", "udise_enrolment_total", "udise_teachers_total", "udise_single_teacher_schools"]) {
    const sum = states.reduce((a, s) => a + (get(id, s) ?? 0), 0);
    const india = get(id, "")!;
    const diff = sum - india;
    // Published national totals can differ slightly from the state sum (e.g. unallocated/"other" units): report, tolerate 0.1%.
    check(`UDISE+: ${id} states sum to India (|diff| <= 0.1%)`, Math.abs(diff) <= india * 0.001, `sum=${sum} india=${india} diff=${diff}`);
  }
  let ptrBad = 0, avgBad = 0;
  for (const s of ["", ...states]) {
    const sc = get("udise_schools_total", s)!, en = get("udise_enrolment_total", s)!, te = get("udise_teachers_total", s)!;
    if (Math.abs(get("udise_ptr", s)! - en / te) > 1) ptrBad++;
    if (Math.abs(get("udise_avg_enrolment_per_school", s)! - en / sc) > 1) avgBad++;
    if (Math.abs(get("udise_avg_teachers_per_school", s)! - te / sc) > 1) avgBad++;
  }
  check("UDISE+: published PTR equals enrolment/teachers (within rounding)", ptrBad === 0, `${ptrBad} rows off by >1`);
  check("UDISE+: published averages equal totals ratios (within rounding)", avgBad === 0, `${avgBad} rows off by >1`);
  const overTotal = u.filter((r) => r.indicator_id.endsWith("_schools") && r.indicator_id.startsWith("udise_infra_")).filter((r) => (val(r) ?? 0) > (get("udise_schools_total", r.state) ?? 0));
  check("UDISE+: facility counts never exceed total schools", overTotal.length === 0, `${overTotal.length} rows`);
  const shareBad = u.filter((r) => r.indicator_id.endsWith("_share") && ((val(r) ?? -1) < 0 || (val(r) ?? 101) > 100));
  check("UDISE+: derived shares within 0-100", shareBad.length === 0, `${shareBad.length} rows`);
  const internet = get("udise_infra_internet_share", "")!;
  check("UDISE+: national internet share cross-checks with the deck's cited 63.5%", Math.abs(internet - 63.5) < 0.1, `computed ${internet}`);
  const raj = { schools: get("udise_schools_total", "Rajasthan"), teachers: get("udise_teachers_total", "Rajasthan") };
  check("UDISE+: Rajasthan row present with plausible values", (raj.schools ?? 0) > 50000 && (raj.teachers ?? 0) > 300000, JSON.stringify(raj));

  // ---- UDISE+ 2025-26 (additive; the 2024-25 checks above are unchanged) ---------------------------------
  const u26 = rows.filter((r) => r.source_id === "udise_2025_26_booklet");
  if (u26.length) {
    const g26 = (id: string, state: string) => val(u26.find((r) => r.indicator_id === id && r.state === state && r.geography_level === (state ? "state" : "national"))!);
    const st26 = [...new Set(u26.filter((r) => r.geography_level === "state").map((r) => r.state))];
    check("UDISE+ 2025-26: 36 states/UTs + India present", st26.length === STATES.length && STATES.every((s) => st26.includes(s)) && u26.some((r) => r.geography_level === "national"), `${st26.length} states`);
    check("UDISE+ 2025-26: every row carries the 2025-26 reference period", u26.every((r) => r.reference_period === "UDISE+ 2025-26"), "other period found");
    for (const id of ["udise_schools_total", "udise_enrolment_total", "udise_teachers_total", "udise_single_teacher_schools"]) {
      const sum = st26.reduce((acc, s) => acc + (g26(id, s) ?? 0), 0);
      const india = g26(id, "")!;
      check(`UDISE+ 2025-26: ${id} states sum to India (|diff| <= 0.1%)`, Math.abs(sum - india) <= india * 0.001, `sum=${sum} india=${india}`);
    }
    let ptr26 = 0, avg26 = 0;
    for (const s of ["", ...st26]) {
      const sc = g26("udise_schools_total", s)!, en = g26("udise_enrolment_total", s)!, te = g26("udise_teachers_total", s)!;
      if (Math.abs(g26("udise_ptr", s)! - en / te) > 1) ptr26++;
      if (Math.abs(g26("udise_avg_enrolment_per_school", s)! - en / sc) > 1) avg26++;
      if (Math.abs(g26("udise_avg_teachers_per_school", s)! - te / sc) > 1) avg26++;
    }
    check("UDISE+ 2025-26: published PTR equals enrolment/teachers (within rounding)", ptr26 === 0, `${ptr26} rows off by >1`);
    check("UDISE+ 2025-26: published averages equal totals ratios (within rounding)", avg26 === 0, `${avg26} rows off by >1`);
    const over26 = u26.filter((r) => r.indicator_id.startsWith("udise_infra_") && r.indicator_id.endsWith("_schools") && (val(r) ?? 0) > (g26("udise_schools_total", r.state) ?? 0));
    check("UDISE+ 2025-26: facility counts never exceed total schools", over26.length === 0, `${over26.length} rows`);
    const share26 = u26.filter((r) => r.indicator_id.endsWith("_share") && ((val(r) ?? -1) < 0 || (val(r) ?? 101) > 100));
    check("UDISE+ 2025-26: derived shares within 0-100", share26.length === 0, `${share26.length} rows`);
    // Independent cross-check against figures the booklet itself prints in prose (p.11 headline table, p.29 national percentages).
    const f26 = path.join(RAW, "udise_2025_26_booklet.pdf");
    if (fs.existsSync(f26)) {
      const pg = await pdfPages(f26, [11, 29]);
      const t11 = pg.find((p) => p.page === 11)!.items.map((i) => i.str).join(" ");
      const t29 = pg.find((p) => p.page === 29)!.items.map((i) => i.str).join(" ");
      const n = (x: string) => Number(x.replace(/,/g, ""));
      const m11 = t11.match(/Total Number of Schools\s+([\d,]+)[\s\S]*?Enrolments[^\d]*([\d,]{9,})[\s\S]*?Total Number of teachers\s+([\d,]+)\s+Pupil Teacher Ratio\s+(\d+)/);
      check(
        "UDISE+ 2025-26: national totals equal the booklet's printed headline table (p.11)",
        !!m11 && n(m11[1]) === g26("udise_schools_total", "") && n(m11[2]) === g26("udise_enrolment_total", "") && n(m11[3]) === g26("udise_teachers_total", "") && n(m11[4]) === g26("udise_ptr", ""),
        m11 ? `printed ${m11.slice(1, 5).join("/")}` : "headline table not found on p.11",
      );
      const printed: [string, string][] = [
        ["udise_infra_library_share", "Libraries/Reading Corner/Book Bank facilities"], ["udise_infra_playground_share", "playground facility"],
        ["udise_infra_computer_share", "computer facility"], ["udise_infra_internet_share", "internet facility"],
        ["udise_infra_drinking_water_share", "drinking water facility"], ["udise_infra_handwash_share", "hand wash facilities"],
      ];
      const bad: string[] = [];
      for (const [id, label] of printed) {
        const m = t29.match(new RegExp(`Percentage of schools having ${label.replace(/[/]/g, "\\/")}\\s+([\\d.]+)`));
        const ours = g26(id, "");
        if (!m || ours === null || Math.abs(Number(m[1]) - ours) > 0.11) bad.push(`${id}: printed ${m?.[1] ?? "n/a"} vs computed ${ours}`);
      }
      check("UDISE+ 2025-26: national facility shares match the percentages printed on p.29", bad.length === 0, bad.join("; "));
    }
  }

  // ---- ASER --------------------------------------------------------------------------------------------
  const a =rows.filter((r) => r.source_id.startsWith("aser_"));
  const outOfRange = a.filter((r) => val(r) !== null && ((val(r) as number) < 0 || (val(r) as number) > 100));
  check("ASER: all percentages within 0-100", outOfRange.length === 0, `${outOfRange.length} rows`);
  const ciBad = a.filter((r) => r.ci95_half_width !== "" && (Number(r.ci95_half_width) <= 0 || Number(r.ci95_half_width) > 35));
  check("ASER: confidence-interval half-widths plausible (0-35 points)", ciBad.length === 0, `${ciBad.length} rows`);
  const stateIds = ["rajasthan", "gujarat", "haryana", "uttar_pradesh", "madhya_pradesh", "bihar", "punjab", "uttarakhand"];
  for (const id of stateIds) {
    const st = a.filter((r) => r.source_id === `aser_2024_${id}_state`);
    check(`ASER state page ${id}: 10 indicators parsed`, st.length === 10, `${st.length}`);
    // Cross-file: divisional 2024 state row must equal the district table's state row for the same indicator.
    const dist = a.filter((r) => r.source_id === `aser_2024_${id}_district` && r.geography_level === "state");
    const divs = a.filter((r) => r.source_id === `aser_2024_${id}_divisional` && r.geography_level === "state" && r.reference_period === "ASER 2024");
    if (dist.length && divs.length) {
      let mism = 0;
      for (const d of dist) {
        const m = divs.find((x) => x.indicator_id === d.indicator_id);
        if (m && val(d) !== null && val(m) !== null && Math.abs((val(d) as number) - (val(m) as number)) > 0.11) mism++;
      }
      check(`ASER ${id}: divisional-2024 state values equal district-table state values`, mism === 0, `${mism} mismatches`);
    } else if (!dist.length) {
      warnings.push(`ASER ${id}: no district-estimates file exists/parsed for this state; district-vs-divisional cross-check skipped`);
    } else if (!divs.length) {
      warnings.push(`ASER ${id}: divisional file has no state-total row; cross-check skipped`);
    }
    const nDist = new Set(a.filter((r) => r.source_id === `aser_2024_${id}_district` && r.geography_level === "district").map((r) => r.area)).size;
    if (nDist) {
      const header = await districtCoverage(id);
      if (header) check(`ASER ${id}: parsed ${nDist} districts, source says ${header.n} of ${header.m}`, nDist >= header.n, `parsed ${nDist} < ${header.n}`);
    }
  }
  const supp = rows.filter((r) => r.value_status === "suppressed").length;
  const quality = Object.fromEntries([...new Set(rows.map((r) => r.source_id))].map((s) => {
    const rs = rows.filter((r) => r.source_id === s);
    const sp = rs.filter((r) => r.value_status === "suppressed").length;
    return [s, { rows: rs.length, suppressed: sp, completeness_pct: Number((((rs.length - sp) / rs.length) * 100).toFixed(1)) }];
  }));

  const report = {
    validated_at_utc: nowIso(), total_rows: rows.length, suppressed_rows: supp, checks, failures, warnings, per_source: quality,
    coverage: {
      udise_states_uts: states.length,
      aser_states_with_state_page: stateIds.filter((id) => a.some((r) => r.source_id === `aser_2024_${id}_state`)).length,
      aser_districts_parsed: new Set(a.filter((r) => r.geography_level === "district").map((r) => `${r.state}|${r.area}`)).size,
      aser_divisions_parsed: new Set(a.filter((r) => r.geography_level === "division").map((r) => `${r.state}|${r.area}`)).size,
    },
  };
  writeJson(path.join(REPORTS, "data_quality.json"), report);
  console.log(`\n${checks.filter((c) => c.ok).length}/${checks.length} checks passed; ${warnings.length} warnings.`);
  if (failures.length) process.exit(1);
}

/** Reads the ASER state page's "n OUT OF m DISTRICTS" statement to compare coverage with what was parsed. */
async function districtCoverage(id: string): Promise<{ n: number; m: number } | null> {
  const f = path.join(RAW, `aser_2024_${id}_state.pdf`);
  if (!fs.existsSync(f)) return null;
  const [p1] = await pdfPages(f, [1]);
  const text = p1.items.map((i) => i.str).join(" ");
  const m = text.match(/(\d+)\s+OUT OF\s+(\d+)\s+DISTRICTS/i);
  return m ? { n: Number(m[1]), m: Number(m[2]) } : null;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
