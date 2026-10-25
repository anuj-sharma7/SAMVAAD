/**
 * npm run data:registry-doc
 * Renders data/source_registry.csv (+ file sizes on disk) into docs/DATA_SOURCE_REGISTRY.md.
 * Contains metadata only: no raw data values are copied into the report.
 */
import fs from "node:fs";
import path from "node:path";
import { parseCsvObjects } from "../../src/lib/data-sources/csv";
import { DATA, nowIso } from "./lib";

const root = path.resolve(DATA, "..");
const rows = parseCsvObjects(fs.readFileSync(path.join(DATA, "source_registry.csv"), "utf8"));
const cell = (v: string | undefined) => (v ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim() || "—";
const size = (rel: string) => {
  if (!rel) return "—";
  const f = path.join(root, rel);
  return fs.existsSync(f) ? `${fs.statSync(f).size.toLocaleString("en-US")} B` : "missing on disk";
};

const by = (s: string) => rows.filter((r) => r.access_status === s);
const statuses = [...new Set(rows.map((r) => r.access_status))].sort();
const lines: string[] = [];
lines.push("# SAMVAAD data source registry", "");
lines.push(`Generated ${nowIso()} by \`npm run data:registry-doc\` from \`data/source_registry.csv\`. Do not edit by hand; re-run the script.`, "");
lines.push("Every source SAMVAAD looked at is listed, including the ones that could not be used and why. Only sources with status", "`downloaded_and_validated` contribute data to the app. Nothing here was scraped past a login, CAPTCHA or access restriction;", "blocked sources are recorded as blocked (see `docs/data_access_requests.md` for what a human must do to obtain them).", "");
lines.push("## Summary", "", "| Access status | Sources |", "|---|---|");
for (const s of statuses) lines.push(`| \`${s}\` | ${by(s).length} |`);
lines.push(`| **Total** | **${rows.length}** |`, "");
const nChecks = (() => {
  try {
    return (JSON.parse(fs.readFileSync(path.join(DATA, "reports", "data_quality.json"), "utf8")) as { checks: unknown[] }).checks.length;
  } catch {
    return "unknown number of";
  }
})();
lines.push(`Validation evidence: \`data/reports/data_quality.json\` (${nChecks} checks; run \`npm run data:validate\`), \`data/reports/ingestion_report.md\`, \`data/metadata/download_log.json\`, \`data/metadata/dataset_manifest.json\`.`, "");

lines.push("## Sources used by the application (downloaded and validated)", "");
lines.push("| Source ID | Title | Publisher | Reference period | Geography | Rows/items | Local file | Size | SHA-256 | Retrieved (UTC) | Rights / terms | Source URL |", "|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of by("downloaded_and_validated")) {
  lines.push(`| \`${r.source_id}\` | ${cell(r.source_name)} | ${cell(r.publisher)} | ${cell(r.reference_year_or_period)} | ${cell(r.geography_level)} · ${cell(r.geography_coverage)} | ${cell(r.row_count)} | ${cell(r.file_path)} | ${size(r.file_path)} | \`${cell(r.sha256).slice(0, 16)}…\` | ${cell(r.retrieved_at_utc)} | ${cell(r.licence_or_terms)} | ${cell(r.source_url)} |`);
}
lines.push("", "Full SHA-256 values are in `data/source_registry.csv`. Raw files live in `data/raw/` (git-ignored, re-downloadable with `npm run data:download`).", "");

lines.push("## Sources not used (blocked, unavailable or reference-only)", "");
lines.push("| Source ID | Title | Status | Why | Source URL |", "|---|---|---|---|---|");
for (const r of rows.filter((x) => x.access_status !== "downloaded_and_validated")) {
  lines.push(`| \`${r.source_id}\` | ${cell(r.source_name)} | \`${r.access_status}\` | ${cell(r.access_detail || r.known_limitations)} | ${cell(r.source_url)} |`);
}
lines.push("", "## Known limitations of the used sources", "");
for (const r of by("downloaded_and_validated")) lines.push(`- **${r.source_id}**: ${cell(r.known_limitations)}`);
lines.push("", "## Licence note", "", "Licence/terms text is recorded as published by each source at retrieval time. Where a source gave no explicit licence, the registry says so; that is not a grant of rights. Re-check terms before any redistribution beyond this prototype.", "");
fs.writeFileSync(path.join(root, "docs", "DATA_SOURCE_REGISTRY.md"), lines.join("\n"));
console.log(`docs/DATA_SOURCE_REGISTRY.md written (${rows.length} sources, ${by("downloaded_and_validated").length} used).`);
