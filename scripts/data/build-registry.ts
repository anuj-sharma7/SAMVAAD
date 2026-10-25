/**
 * npm run data:registry
 * Combines the source catalogue, the download log and the parse outputs into:
 *   data/source_registry.csv, data/metadata/dataset_manifest.json, data/reports/ingestion_report.md
 */
import path from "node:path";
import fs from "node:fs";
import { SOURCES, type AccessStatus } from "./sources";
import { DATA, META, REPORTS, PROCESSED, readJson, writeCsv, writeJson, nowIso, sha256 } from "./lib";
import { SCHEMA_VERSION } from "./schema";
import type { DownloadOutcome } from "./download";

const COLUMNS = [
  "source_id", "source_name", "publisher", "source_url", "download_url_or_api", "retrieved_at_utc", "published_at",
  "reference_year_or_period", "geography_level", "geography_coverage", "dataset_type", "format", "licence_or_terms",
  "access_status", "sha256", "file_path", "row_count", "schema_version", "transformation_notes", "known_limitations",
  "citation_or_attribution", "access_detail",
];

const log = readJson<DownloadOutcome[]>(path.join(META, "download_log.json"), []);
const parse = readJson<{ outputs?: Record<string, { rows: number; problems: string[] }> }>(path.join(META, "parse_outputs.json"), {});
const quality = readJson<{ validated_at_utc?: string; failures?: string[]; warnings?: string[]; checks?: { ok: boolean }[]; coverage?: Record<string, number> }>(path.join(REPORTS, "data_quality.json"), {});
const outcome = new Map(log.map((o) => [o.source_id, o]));
// Teaching-practice sources are "validated" by verbatim excerpt extraction (scripts/data/extract-kb.ts), not by statistical parsing.
const kb = readJson<{ source_id?: string; chunks?: unknown[] }>(path.join(DATA, "knowledge", "kb_chunks.json"), {});

const rows = SOURCES.map((s) => {
  const o = outcome.get(s.source_id);
  const parsed = s.source_id === kb.source_id ? { rows: kb.chunks?.length ?? 0, problems: [] as string[] } : parse.outputs?.[s.source_id];
  const isKb = s.source_id === kb.source_id;
  const status: AccessStatus = o?.access_status ?? "unavailable";
  const usable = status === "downloaded_and_validated" && parsed && parsed.rows > 0 && parsed.problems.length === 0;
  return {
    source_id: s.source_id, source_name: s.source_name, publisher: s.publisher, source_url: s.source_url,
    download_url_or_api: s.download_url ?? "", retrieved_at_utc: o?.retrieved_at_utc ?? "", published_at: "",
    reference_year_or_period: s.reference_year_or_period, geography_level: s.geography_level, geography_coverage: s.geography_coverage,
    dataset_type: s.dataset_type, format: s.format, licence_or_terms: s.licence_or_terms,
    // A downloaded PDF whose tables were not parsed is "report_downloaded", never "downloaded_and_validated".
    access_status: status === "downloaded_and_validated" && !usable ? "report_downloaded" : status,
    sha256: o?.sha256 ?? "", file_path: o?.file_path ?? "", row_count: parsed?.rows ?? "", schema_version: parsed ? (isKb ? "kb_chunks/1" : SCHEMA_VERSION) : "",
    transformation_notes: parsed && isKb ? "Short verbatim excerpts copied from the PDF by anchor text (npm run kb:extract); each excerpt keeps its page number and starts pending_review." : parsed ? "Tables parsed from the PDF with pdfjs-dist; positional text rebuilt into rows; validated by data:validate (arithmetic and cross-file checks)." : "",
    known_limitations: s.known_limitations, citation_or_attribution: s.citation_or_attribution,
    access_detail: o?.detail ?? "Not attempted yet. Run npm run data:download.",
  };
});

writeCsv(path.join(DATA, "source_registry.csv"), COLUMNS, rows);

const processedFiles = ["indicators_long.csv", "indicator_definitions.csv", "geographies.csv"].map((f) => {
  const file = path.join(PROCESSED, f);
  return fs.existsSync(file) ? { file: `data/processed/${f}`, bytes: fs.statSync(file).size, sha256: sha256(fs.readFileSync(file)) } : null;
}).filter(Boolean);

writeJson(path.join(META, "dataset_manifest.json"), {
  generated_at_utc: nowIso(), schema_version: SCHEMA_VERSION, processed_files: processedFiles,
  sources: rows.map((r) => ({ source_id: r.source_id, access_status: r.access_status, sha256: r.sha256 || null, row_count: r.row_count || null })),
  validation: { validated_at_utc: quality.validated_at_utc ?? null, checks_total: quality.checks?.length ?? 0, checks_passed: quality.checks?.filter((c) => c.ok).length ?? 0, failures: quality.failures ?? [], warnings: quality.warnings ?? [] },
});

const by = (st: string) => rows.filter((r) => r.access_status === st);
const line = (r: (typeof rows)[number]) => `- \`${r.source_id}\` (${r.reference_year_or_period}; ${r.geography_coverage}): ${r.access_detail}${r.row_count ? ` Rows parsed: ${r.row_count}.` : ""}`;
const md = `# Public data ingestion report

Generated ${nowIso()} by \`npm run data:registry\`. Source of truth: \`data/source_registry.csv\`.

## Summary

| Status | Sources |
|---|---|
${["downloaded_and_validated", "report_downloaded", "public_page_only", "manual_download_needed", "registration_or_request_required", "captcha_or_interaction_blocked", "unavailable"].map((s) => `| ${s} | ${by(s).length} |`).join("\n")}

Validation: ${quality.checks?.filter((c) => c.ok).length ?? 0}/${quality.checks?.length ?? 0} checks passed (${quality.validated_at_utc ?? "not run"}).
Processed rows: ${parse.outputs ? Object.values(parse.outputs).reduce((a, o) => a + o.rows, 0) : 0}.
Coverage: ${JSON.stringify(quality.coverage ?? {})}.

## Downloaded and validated (real files, signature-checked, parsed)
${by("downloaded_and_validated").map(line).join("\n") || "- none"}

## Downloaded but not parsed into indicators
${by("report_downloaded").map(line).join("\n") || "- none"}

## Blocked or unavailable (nothing was bypassed)
${[...by("manual_download_needed"), ...by("registration_or_request_required"), ...by("captcha_or_interaction_blocked"), ...by("unavailable")].map(line).join("\n") || "- none"}

## Public pages inspected only (no dataset taken)
${by("public_page_only").map(line).join("\n") || "- none"}

## Validation warnings
${(quality.warnings ?? []).map((w) => `- ${w}`).join("\n") || "- none"}
${(quality.failures ?? []).length ? "\n## VALIDATION FAILURES\n" + (quality.failures ?? []).map((w) => `- ${w}`).join("\n") : ""}
`;
fs.writeFileSync(path.join(REPORTS, "ingestion_report.md"), md);
console.log(`Registry: ${rows.length} sources -> data/source_registry.csv`);
for (const st of new Set(rows.map((r) => r.access_status))) console.log(`  ${st}: ${by(st).length}`);
