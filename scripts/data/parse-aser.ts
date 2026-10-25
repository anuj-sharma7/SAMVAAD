import fs from "node:fs";
import path from "node:path";
import { pdfPages, toLines, RAW } from "./lib";
import type { IndicatorRow } from "./schema";

const PERIOD = "ASER 2024";
const numTok = (s: string) => /^-?\d+(\.\d+)?$/.test(s);

function row(
  source_id: string, indicator_id: string, level: IndicatorRow["geography_level"], state: string, area: string, value: number | null,
  locator: string, extra: Partial<IndicatorRow> = {},
): IndicatorRow {
  return {
    indicator_id, source_id, geography_level: level, state, area, reference_period: PERIOD, value, ci95_half_width: null,
    value_status: value === null ? "suppressed" : "reported", source_locator: locator, notes: "", ...extra,
  };
}

// ---- District estimates: "Performance of districts" table -----------------------------------------------------------
const DISTRICT_COLS = [
  "aser_enrol_govt_6_14", "aser_not_in_school_6_14", "aser_std3_5_read_std2", "aser_std3_5_subtraction",
  "aser_std6_8_read_std2", "aser_std6_8_division",
];

export async function parseDistrictEstimates(sourceId: string, state: string): Promise<{ rows: IndicatorRow[]; problems: string[] }> {
  const file = path.join(RAW, `${sourceId}.pdf`);
  const rows: IndicatorRow[] = [];
  const problems: string[] = [];
  let anchors: number[] | null = null;
  for (const p of await pdfPages(file)) {
    const lines = toLines(p.items);
    for (const l of lines) {
      const name = l.cells[0];
      if (!name || numTok(name.str) || name.x > 60) continue;
      const vals = l.cells.slice(1);
      const numeric = vals.filter((c) => numTok(c.str));
      if (numeric.length === 0) {
        // A district printed with a marker such as "Data insufficient" is kept as an explicit suppressed row.
        const marker = vals.map((c) => c.str).join(" ").trim();
        if (/insufficient|not presented|^na$|^n\.a\.?$/i.test(marker)) {
          DISTRICT_COLS.forEach((id) => rows.push(row(sourceId, id, "district", state, name.str, null, `District table, p.${p.page}`, { notes: `source marker "${marker}"` })));
        }
        continue;
      }
      if (numeric.length === 6) anchors ??= numeric.map((c) => c.x);
      if (!anchors) continue;
      // Place every cell on its nearest column so a missing (suppressed) cell cannot shift the others.
      const placed: (number | null | string)[] = Array(6).fill(null);
      for (const c of vals) {
        const idx = anchors.reduce((best, a, i) => (Math.abs(a - c.x) < Math.abs(anchors![best] - c.x) ? i : best), 0);
        if (Math.abs(anchors[idx] - c.x) > 18) continue;
        placed[idx] = numTok(c.str) ? Number(c.str) : c.str;
      }
      if (placed.every((v) => v === null)) continue;
      const isStateRow = name.str === state;
      DISTRICT_COLS.forEach((id, i) => {
        const v = placed[i];
        rows.push(
          row(sourceId, id, isStateRow ? "state" : "district", state, isStateRow ? "" : name.str, typeof v === "number" ? v : null,
            `District table, p.${p.page}`, typeof v === "string" ? { notes: `source marker "${v}"` } : v === null ? { notes: "cell absent in source (not presented)" } : {}),
        );
      });
    }
  }
  const nDistricts = new Set(rows.filter((r) => r.geography_level === "district").map((r) => r.area)).size;
  if (nDistricts === 0) problems.push(`${sourceId}: no district rows parsed`);
  if (!rows.some((r) => r.geography_level === "state")) problems.push(`${sourceId}: state total row not found`);
  return { rows, problems };
}

// ---- Divisional estimates: three years with 95% CI ------------------------------------------------------------------------
const DIV_COLS = DISTRICT_COLS;
const YEARS = ["2018", "2022", "2024"];

export async function parseDivisionalEstimates(sourceId: string, state: string): Promise<{ rows: IndicatorRow[]; problems: string[] }> {
  const file = path.join(RAW, `${sourceId}.pdf`);
  const rows: IndicatorRow[] = [];
  const problems: string[] = [];
  for (const p of await pdfPages(file)) {
    const lines = toLines(p.items);
    let est: number[] | null = null;
    let divName: string | null = null;
    for (const l of lines) {
      const nums = l.cells.filter((c) => numTok(c.str) && c.x > 90).map((c) => Number(c.str));
      const isEstimate = nums.length === 18 && l.cells.every((c) => numTok(c.str));
      const ci = l.cells.filter((c) => c.str.includes("±")).flatMap((c) => [...c.str.matchAll(/±\s*(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1])));
      if (isEstimate) { est = nums; divName = null; continue; }
      // The division name is printed on its own line between the estimate row and its confidence-interval row.
      if (est && !divName && l.cells.length === 1 && !numTok(l.cells[0].str) && !l.cells[0].str.includes("±") && l.cells[0].x < 80) { divName = l.cells[0].str; continue; }
      if (est && ci.length > 0) {
        const nameCell = divName ? { str: divName } : l.cells.find((c) => !c.str.includes("±") && !numTok(c.str) && c.x < 80);
        if (!nameCell) { problems.push(`${sourceId} p.${p.page}: CI row without a division name`); est = null; continue; }
        if (ci.length !== 18) problems.push(`${sourceId} p.${p.page} ${nameCell.str}: expected 18 CI values, found ${ci.length}`);
        const isState = nameCell.str === state;
        est.forEach((v, k) => {
          const ind = DIV_COLS[Math.floor(k / 3)];
          const year = YEARS[k % 3];
          rows.push({
            ...row(sourceId, ind, isState ? "state" : "division", state, isState ? "" : nameCell.str, v, `Divisional table, p.${p.page}`),
            reference_period: `ASER ${year}`, ci95_half_width: ci.length === 18 ? ci[k] : null,
            notes: "ci95_half_width = published ± value (twice the standard error)",
          });
        });
        est = null;
        divName = null;
      }
    }
  }
  const n = new Set(rows.filter((r) => r.geography_level === "division").map((r) => r.area)).size;
  if (n === 0) problems.push(`${sourceId}: no divisions parsed`);
  return { rows, problems };
}

// ---- State pages: Table 1 (enrolment), Table 4 (reading), Table 7 (arithmetic) -------------------------------------------
const ROMAN = new Set(["I", "II", "III", "IV", "V", "VI", "VII", "VIII"]);

export async function parseStatePage(sourceId: string, state: string): Promise<{ rows: IndicatorRow[]; problems: string[] }> {
  const file = path.join(RAW, `${sourceId}.pdf`);
  const rows: IndicatorRow[] = [];
  const problems: string[] = [];
  const pages = await pdfPages(file, [1, 2, 3]);
  const tableRows = (pageNo: number, wantCols: number) => {
    const lines = toLines(pages.find((p) => p.page === pageNo)?.items ?? []);
    const out = new Map<string, number[]>();
    for (const l of lines) {
      const first = l.cells[0];
      if (!first || !ROMAN.has(first.str) || first.x > 60) continue;
      const nums = l.cells.slice(1).filter((c) => numTok(c.str) && c.x < 300).map((c) => Number(c.str));
      if (nums.length === wantCols && Math.abs(nums[nums.length - 1] - 100) < 0.01) out.set(first.str, nums);
    }
    return out;
  };

  // Table 1: "Age 6-14: All" -> govt, pvt, other, not in school, total
  for (const l of toLines(pages.find((p) => p.page === 1)?.items ?? [])) {
    if (l.cells[0]?.str === "Age 6-14: All") {
      const nums = l.cells.slice(1).filter((c) => numTok(c.str) && c.x < 280).map((c) => Number(c.str));
      if (nums.length === 5) {
        const [govt, pvt, other, nis, total] = nums;
        if (Math.abs(govt + pvt + other + nis - total) > 0.5) problems.push(`${sourceId}: Table 1 row does not sum to ${total}`);
        for (const [id, v] of [["aser_enrol_govt_6_14", govt], ["aser_enrol_pvt_6_14", pvt], ["aser_enrol_other_6_14", other], ["aser_not_in_school_6_14", nis]] as const) {
          rows.push(row(sourceId, id, "state", state, "", v, "Table 1, p.1"));
        }
      }
    }
  }
  // Table 4 reading: [not even letter, letter, word, Std I text, Std II text, total]
  const reading = tableRows(2, 6);
  for (const [grade, id] of [["III", "aser_std3_read_std2"], ["V", "aser_std5_read_std2"], ["VIII", "aser_std8_read_std2"]] as const) {
    const r = reading.get(grade);
    if (!r) { problems.push(`${sourceId}: Table 4 Std ${grade} row not found`); continue; }
    const sum = r.slice(0, 5).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 100) > 0.6) problems.push(`${sourceId}: Table 4 Std ${grade} categories sum to ${sum.toFixed(1)}`);
    rows.push(row(sourceId, id, "state", state, "", r[4], "Table 4, p.2"));
  }
  // Table 7 arithmetic: [not even 1-9, recognise 1-9, recognise 10-99, subtract, divide, total]
  const arith = tableRows(3, 6);
  for (const [grade, id] of [["III", "aser_std3_subtraction"], ["V", "aser_std5_division"], ["VIII", "aser_std8_division"]] as const) {
    const r = arith.get(grade);
    if (!r) { problems.push(`${sourceId}: Table 7 Std ${grade} row not found`); continue; }
    const sum = r.slice(0, 5).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 100) > 0.6) problems.push(`${sourceId}: Table 7 Std ${grade} categories sum to ${sum.toFixed(1)}`);
    if (grade === "III") rows.push(row(sourceId, id, "state", state, "", Number((r[3] + r[4]).toFixed(1)), "Table 7, p.3", { value_status: "derived", notes: "= 'subtract' + 'divide' categories" }));
    else rows.push(row(sourceId, id, "state", state, "", r[4], "Table 7, p.3"));
  }
  if (rows.length === 0) problems.push(`${sourceId}: nothing parsed`);
  return { rows, problems };
}

export const fileExists = (id: string) => fs.existsSync(path.join(RAW, `${id}.pdf`));
