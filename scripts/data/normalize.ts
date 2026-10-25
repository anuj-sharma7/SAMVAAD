/**
 * npm run data:normalize
 * Parses the downloaded raw files into data/processed/ (indicators_long.csv, indicator_definitions.csv,
 * geographies.csv) and records per-source row counts in data/metadata/parse_outputs.json.
 * Raw files are read-only inputs; processed files are fully regenerated, so the run is idempotent.
 */
import path from "node:path";
import { PROCESSED, META, writeCsv, writeJson, nowIso } from "./lib";
import { INDICATOR_COLUMNS, INDICATOR_DEFS, SCHEMA_VERSION, type IndicatorRow } from "./schema";
import { parseUdise, UDISE_2024_25, UDISE_2025_26 } from "./parse-udise";
import { fileExists, parseDistrictEstimates, parseDivisionalEstimates, parseStatePage } from "./parse-aser";

const ASER_STATES: [string, string][] = [
  ["rajasthan", "Rajasthan"], ["gujarat", "Gujarat"], ["haryana", "Haryana"], ["uttar_pradesh", "Uttar Pradesh"],
  ["madhya_pradesh", "Madhya Pradesh"], ["bihar", "Bihar"], ["punjab", "Punjab"], ["uttarakhand", "Uttarakhand"],
];

async function main() {
  const all: IndicatorRow[] = [];
  const outputs: Record<string, { rows: number; problems: string[]; parsed_at_utc: string }> = {};
  const add = (id: string, r: { rows: IndicatorRow[]; problems: string[] }) => {
    all.push(...r.rows);
    outputs[id] = { rows: r.rows.length, problems: r.problems, parsed_at_utc: nowIso() };
    console.log(`${id.padEnd(40)} rows=${String(r.rows.length).padStart(5)} problems=${r.problems.length}`);
    r.problems.forEach((p) => console.log("   !", p));
  };

  if (fileExists("udise_2024_25_booklet")) add("udise_2024_25_booklet", await parseUdise(UDISE_2024_25));
  if (fileExists("udise_2025_26_booklet")) add("udise_2025_26_booklet", await parseUdise(UDISE_2025_26));
  for (const [id, state] of ASER_STATES) {
    if (fileExists(`aser_2024_${id}_state`)) add(`aser_2024_${id}_state`, await parseStatePage(`aser_2024_${id}_state`, state));
    if (fileExists(`aser_2024_${id}_district`)) add(`aser_2024_${id}_district`, await parseDistrictEstimates(`aser_2024_${id}_district`, state));
    if (fileExists(`aser_2024_${id}_divisional`)) add(`aser_2024_${id}_divisional`, await parseDivisionalEstimates(`aser_2024_${id}_divisional`, state));
  }

  // Deterministic order so reruns produce byte-identical files.
  all.sort((a, b) =>
    a.source_id.localeCompare(b.source_id) || a.indicator_id.localeCompare(b.indicator_id) || a.state.localeCompare(b.state) ||
    a.area.localeCompare(b.area) || a.reference_period.localeCompare(b.reference_period));

  writeCsv(path.join(PROCESSED, "indicators_long.csv"), INDICATOR_COLUMNS as string[], all as unknown as Record<string, unknown>[]);
  writeCsv(path.join(PROCESSED, "indicator_definitions.csv"), ["indicator_id", "label", "description", "unit", "domain", "survey_type", "caveat"], INDICATOR_DEFS as unknown as Record<string, unknown>[]);

  const geos = new Map<string, Record<string, unknown>>();
  for (const r of all) {
    const key = [r.geography_level, r.state, r.area].join("|");
    if (!geos.has(key)) geos.set(key, { geography_level: r.geography_level, state: r.state, area_label_in_source: r.area, first_source_id: r.source_id });
  }
  writeCsv(path.join(PROCESSED, "geographies.csv"), ["geography_level", "state", "area_label_in_source", "first_source_id"], [...geos.values()].sort((a, b) => String(a.state).localeCompare(String(b.state)) || String(a.area_label_in_source).localeCompare(String(b.area_label_in_source))));

  writeJson(path.join(META, "parse_outputs.json"), { schema_version: SCHEMA_VERSION, total_rows: all.length, outputs });
  console.log(`\nWrote ${all.length} indicator rows, ${geos.size} geographies.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
