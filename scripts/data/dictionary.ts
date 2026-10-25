/**
 * npm run data:dictionary
 * Regenerates the machine-derived blocks of docs/DATA_DICTIONARY.md (everything between
 * `<!-- BEGIN:<name> -->` and `<!-- END:<name> -->`) from the real files, so the file list, column names,
 * indicator table and per-source status can never drift from the data. The prose around the blocks is hand-written.
 */
import fs from "node:fs";
import path from "node:path";
import { PROCESSED, ROOT, DATA, parseCsv } from "./lib";

const DOC = path.join(ROOT, "docs", "DATA_DICTIONARY.md");

type Row = Record<string, string>;
function readCsv(file: string): { header: string[]; rows: Row[] } {
  const parsed = parseCsv(fs.readFileSync(file, "utf8"));
  const header = parsed[0];
  return { header, rows: parsed.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""]))) };
}
const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
const table = (head: string[], body: string[][]) =>
  [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...body.map((r) => `| ${r.map(esc).join(" | ")} |`)].join("\n");

function filesBlock(): string {
  const parts: string[] = [];
  const files: [string, string][] = [
    [path.join(PROCESSED, "indicators_long.csv"), "data/processed/indicators_long.csv"],
    [path.join(PROCESSED, "indicator_definitions.csv"), "data/processed/indicator_definitions.csv"],
    [path.join(PROCESSED, "geographies.csv"), "data/processed/geographies.csv"],
    [path.join(DATA, "source_registry.csv"), "data/source_registry.csv"],
  ];
  for (const [abs, rel] of files) {
    const { header, rows } = readCsv(abs);
    parts.push(`**\`${rel}\`**: ${rows.length.toLocaleString("en-US")} rows. Columns, in order: ${header.map((h) => `\`${h}\``).join(", ")}.`);
  }
  return parts.join("\n\n");
}

function indicatorsBlock(): string {
  const defs = readCsv(path.join(PROCESSED, "indicator_definitions.csv")).rows;
  const vals = readCsv(path.join(PROCESSED, "indicators_long.csv")).rows;
  const info = new Map<string, { periods: Set<string>; n: number; suppressed: number }>();
  for (const v of vals) {
    const i = info.get(v.indicator_id) ?? { periods: new Set<string>(), n: 0, suppressed: 0 };
    i.periods.add(v.reference_period);
    i.n++;
    if (v.value_status === "suppressed") i.suppressed++;
    info.set(v.indicator_id, i);
  }
  const body = defs.map((d) => {
    const i = info.get(d.indicator_id);
    return [
      `\`${d.indicator_id}\``, d.label, d.unit, d.domain, d.survey_type,
      i ? [...i.periods].sort().join("; ") : "none", i ? String(i.n) : "0", i ? String(i.suppressed) : "0", d.caveat,
    ];
  });
  return `${defs.length} indicators.\n\n${table(["indicator_id", "label", "unit", "domain", "survey_type", "reference periods with values", "rows", "suppressed", "caveat"], body)}`;
}

function sourcesBlock(): string {
  const reg = readCsv(path.join(DATA, "source_registry.csv")).rows;
  const vals = readCsv(path.join(PROCESSED, "indicators_long.csv")).rows;
  const counts = new Map<string, number>();
  for (const v of vals) counts.set(v.source_id, (counts.get(v.source_id) ?? 0) + 1);
  return table(
    ["source_id", "access_status", "reference_year_or_period", "indicator rows"],
    reg.map((r) => [`\`${r.source_id}\``, r.access_status, r.reference_year_or_period, String(counts.get(r.source_id) ?? 0)]),
  );
}

const BLOCKS: Record<string, () => string> = { files: filesBlock, indicators: indicatorsBlock, sources: sourcesBlock };

function main() {
  let doc = fs.readFileSync(DOC, "utf8");
  for (const [name, build] of Object.entries(BLOCKS)) {
    const re = new RegExp(`(<!-- BEGIN:${name} -->)[\\s\\S]*?(<!-- END:${name} -->)`);
    if (!re.test(doc)) throw new Error(`docs/DATA_DICTIONARY.md is missing the <!-- BEGIN:${name} --> / <!-- END:${name} --> markers`);
    doc = doc.replace(re, (_m, a: string, b: string) => `${a}\n${build()}\n${b}`);
  }
  fs.writeFileSync(DOC, doc);
  console.log(`Updated ${Object.keys(BLOCKS).length} generated blocks in docs/DATA_DICTIONARY.md`);
}

main();
