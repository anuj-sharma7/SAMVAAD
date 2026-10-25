import path from "node:path";
import { pdfPages, toLines, RAW } from "./lib";
import { STATES, type IndicatorRow } from "./schema";

export interface UdiseEdition { sourceId: string; period: string }
export const UDISE_2024_25: UdiseEdition = { sourceId: "udise_2024_25_booklet", period: "UDISE+ 2024-25" };
export const UDISE_2025_26: UdiseEdition = { sourceId: "udise_2025_26_booklet", period: "UDISE+ 2025-26" };

const isNum = (s: string) => /^\d[\d,]*$/.test(s);
const num = (s: string) => Number(s.replace(/,/g, ""));

interface StateRow { name: string; nums: number[] }

/**
 * Rebuild state rows from the positioned text of one booklet page. The booklet prints each state on one line,
 * except long names that wrap (e.g. "Dadra and Nagar Haveli and Daman and / Diu") on Table 2.2.
 */
export function stateRows(lines: ReturnType<typeof toLines>, nCols: number): StateRow[] {
  const rows: StateRow[] = [];
  let pending: string | null = null;
  const known = ["India", ...STATES, "Daman & Diu and Dadra & Nagar Haveli"];
  for (const l of lines) {
    const text = l.cells.filter((c) => !isNum(c.str) || c.x < 60).map((c) => c.str).join(" ").trim();
    const nums = l.cells.filter((c) => isNum(c.str) && c.x >= 60).map((c) => num(c.str));
    if (nums.length === nCols) {
      const name = text || pending;
      if (name) rows.push({ name, nums });
      pending = null;
    } else if (nums.length === 0 && text) {
      const last = rows[rows.length - 1];
      if (last && known.some((k) => k === `${last.name} ${text}`)) last.name = `${last.name} ${text}`;
      else if (known.some((k) => k.startsWith(text) && k !== text)) pending = text;
      else if (known.includes(text)) pending = text;
    }
  }
  return rows;
}

/**
 * The 2025-26 booklet prints "&" spellings (e.g. "Jammu & Kashmir", "Daman & Diu and Dadra & Nagar Haveli");
 * map them to the canonical spelling used everywhere else so the same state joins across years and sources.
 * The printed label is kept in `notes`. The 2024-25 booklet already uses canonical names and is untouched.
 */
export function canonicalState(printed: string): string {
  if (printed === "India") return printed;
  if (printed === "Daman & Diu and Dadra & Nagar Haveli") return "Dadra and Nagar Haveli and Daman and Diu";
  return printed.replace(/ & /g, " and ");
}

function mk(ed: UdiseEdition, indicator_id: string, printed: string, value: number, locator: string, status: "reported" | "derived" = "reported", notes = ""): IndicatorRow {
  const name = canonicalState(printed);
  return {
    indicator_id, source_id: ed.sourceId, geography_level: name === "India" ? "national" : "state",
    state: name === "India" ? "" : name, area: "", reference_period: ed.period, value, ci95_half_width: null,
    value_status: status, source_locator: locator,
    notes: name !== printed ? [notes, `printed as "${printed}"`].filter(Boolean).join("; ") : notes,
  };
}

/**
 * Table 2.2 (page 32) and Table 2.5 (pages 35-36) of a UDISE+ booklet (existing structure). The 2024-25 and 2025-26
 * booklets use the same page numbers and column order (checked against the printed column headers).
 */
export async function parseUdise(ed: UdiseEdition = UDISE_2024_25): Promise<{ rows: IndicatorRow[]; problems: string[] }> {
  const file = path.join(RAW, `${ed.sourceId}.pdf`);
  const pages = await pdfPages(file, [32, 35, 36]);
  const byPage = new Map(pages.map((p) => [p.page, toLines(p.items)]));
  const out: IndicatorRow[] = [];
  const problems: string[] = [];

  // Table 2.2 columns: (2) schools (3) enrolments (4) teachers (5) PTR (6) avg teachers/school (7) avg enrolment/school
  // (8) schools with zero enrolment (9) teachers in zero-enrolment schools [not used] (10) single-teacher schools (11) enrolment in them
  const t22 = stateRows(byPage.get(32) ?? [], 10);
  const map22: [number, string][] = [
    [0, "udise_schools_total"], [1, "udise_enrolment_total"], [2, "udise_teachers_total"], [3, "udise_ptr"],
    [4, "udise_avg_teachers_per_school"], [5, "udise_avg_enrolment_per_school"], [6, "udise_zero_enrolment_schools"],
    [8, "udise_single_teacher_schools"], [9, "udise_enrolment_in_single_teacher_schools"],
  ];
  for (const r of t22) for (const [i, id] of map22) out.push(mk(ed, id, r.name, r.nums[i], "Table 2.2, p.32"));
  if (t22.length !== STATES.length + 1) problems.push(`Table 2.2: expected ${STATES.length + 1} rows (India + states/UTs), parsed ${t22.length}`);

  // Table 2.5 page 35 (cols 2..13): total, library, playground, digital library, kitchen garden, girls' toilet, functional girls' toilet,
  // boys' toilet, functional boys' toilet, electricity, functional electricity, solar panel
  const t25a = stateRows(byPage.get(35) ?? [], 12);
  // page 36 (cols 14..25): total, computer, functional computer for pedagogy, internet, drinking water, functional drinking water,
  // hand wash, rainwater harvesting, medical check-up, ramp, handrails..., CWSN toilet
  const t25b = stateRows(byPage.get(36) ?? [], 12);
  const infra = (rows: StateRow[], page: number, picks: [number, string][]) => {
    for (const r of rows) {
      const total = r.nums[0];
      for (const [i, key] of picks) {
        out.push(mk(ed, `udise_infra_${key}_schools`, r.name, r.nums[i], `Table 2.5, p.${page}`));
        out.push(mk(ed, `udise_infra_${key}_share`, r.name, Number(((r.nums[i] / total) * 100).toFixed(1)), `Table 2.5, p.${page}`, "derived", "= schools with facility / total schools x 100"));
      }
    }
  };
  infra(t25a, 35, [[1, "library"], [2, "playground"], [6, "girls_toilet"], [8, "boys_toilet"], [10, "electricity"]]);
  infra(t25b, 36, [[1, "computer"], [3, "internet"], [4, "drinking_water"], [6, "handwash"]]);
  for (const [n, rows] of [["35", t25a], ["36", t25b]] as const) {
    if (rows.length !== STATES.length + 1) problems.push(`Table 2.5 p.${n}: expected ${STATES.length + 1} rows, parsed ${rows.length}`);
  }
  return { rows: out, problems };
}
