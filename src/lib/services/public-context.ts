import { all, get, type Db } from "../db/client";
import { notFound } from "../errors";

/**
 * Read-side service for REAL public education statistics (public_* tables).
 * These are aggregate figures from published reports. They are never joined to fictional visits, teachers or
 * observations, and the service exposes the provenance (source, reference period, geography level) of every value.
 */
export interface SourceView {
  source_id: string; source_name: string; publisher: string; source_url: string; download_url_or_api: string | null;
  retrieved_at_utc: string | null; reference_period: string; geography_level: string; geography_coverage: string;
  dataset_type: string; format: string; licence_or_terms: string; access_status: string; access_detail: string | null;
  sha256: string | null; file_path: string | null; row_count: number | null; known_limitations: string;
  citation_or_attribution: string; is_active: number; transformation_notes: string | null;
}

export interface IndicatorDefView {
  indicator_id: string; label: string; description: string; unit: string; domain: string; survey_type: string; caveat: string;
}

export interface ValueView {
  state: string; area: string; geography_level: string; reference_period: string; value: number | null;
  ci95_half_width: number | null; value_status: string; source_id: string; source_locator: string; notes: string;
}

export function listSources(db: Db): SourceView[] {
  return all<SourceView>(db, "SELECT * FROM public_sources ORDER BY is_active DESC, access_status, source_id");
}

export function getSource(db: Db, id: string): SourceView & { indicators: number } {
  const s = get<SourceView>(db, "SELECT * FROM public_sources WHERE source_id = ?", id);
  if (!s) throw notFound("Data source");
  const n = get<{ n: number }>(db, "SELECT count(*) AS n FROM public_indicators WHERE source_id = ?", id)!.n;
  return { ...s, indicators: n };
}

export function listIndicatorDefs(db: Db): IndicatorDefView[] {
  return all<IndicatorDefView>(db, "SELECT * FROM public_indicator_defs ORDER BY domain, indicator_id");
}

export function getIndicatorDef(db: Db, id: string): IndicatorDefView {
  const d = get<IndicatorDefView>(db, "SELECT * FROM public_indicator_defs WHERE indicator_id = ?", id);
  if (!d) throw notFound("Indicator");
  return d;
}

/** Reference periods that have values for an indicator (e.g. ASER divisional estimates carry 2018, 2022, 2024). */
export function periodsFor(db: Db, indicatorId: string): string[] {
  return all<{ reference_period: string }>(
    db, "SELECT DISTINCT reference_period FROM public_indicators WHERE indicator_id = ? ORDER BY reference_period DESC", indicatorId,
  ).map((r) => r.reference_period);
}

export function statesWithData(db: Db): string[] {
  return all<{ state: string }>(db, "SELECT DISTINCT state FROM public_indicators WHERE state <> '' ORDER BY state").map((r) => r.state);
}

const COLS = "state, area, geography_level, reference_period, value, ci95_half_width, value_status, source_id, source_locator, notes";

/** Values for one indicator at one geography level (optionally one state / period). */
export function valuesFor(
  db: Db, indicatorId: string, opts: { level?: "national" | "state" | "division" | "district"; state?: string; period?: string } = {},
): ValueView[] {
  const where = ["indicator_id = ?"];
  const params: string[] = [indicatorId];
  if (opts.level) { where.push("geography_level = ?"); params.push(opts.level); }
  if (opts.state) { where.push("state = ?"); params.push(opts.state); }
  if (opts.period) { where.push("reference_period = ?"); params.push(opts.period); }
  return all<ValueView>(db, `SELECT ${COLS} FROM public_indicators WHERE ${where.join(" AND ")} ORDER BY state, area, reference_period, source_id`, ...params);
}

export interface Freshness {
  lastIngestion: { finished_at: string; status: string; rows_imported: number; sources_active: number; detail: string; checks_passed: number | null; checks_total: number | null } | null;
  lastSuccessful: { finished_at: string; rows_imported: number } | null;
  oldestRetrieval: string | null;
  newestRetrieval: string | null;
}

export function freshness(db: Db): Freshness {
  const lastIngestion = get<NonNullable<Freshness["lastIngestion"]>>(
    db, "SELECT finished_at, status, rows_imported, sources_active, detail, checks_passed, checks_total FROM public_ingestions ORDER BY id DESC LIMIT 1",
  ) ?? null;
  const lastSuccessful = get<NonNullable<Freshness["lastSuccessful"]>>(
    db, "SELECT finished_at, rows_imported FROM public_ingestions WHERE status = 'imported' ORDER BY id DESC LIMIT 1",
  ) ?? null;
  const r = get<{ a: string | null; b: string | null }>(db, "SELECT min(retrieved_at_utc) AS a, max(retrieved_at_utc) AS b FROM public_sources WHERE is_active = 1");
  return { lastIngestion, lastSuccessful, oldestRetrieval: r?.a ?? null, newestRetrieval: r?.b ?? null };
}

export interface QualityRow { source_id: string; source_name: string; rows: number; suppressed: number; completeness_pct: number; geographies: number }

/** Coverage and completeness per active source, computed from what was imported (no invented confidence scores). */
export function sourceQuality(db: Db): QualityRow[] {
  return all<QualityRow>(
    db,
    `SELECT s.source_id, s.source_name, count(i.id) AS rows,
            sum(CASE WHEN i.value_status = 'suppressed' THEN 1 ELSE 0 END) AS suppressed,
            round(100.0 * sum(CASE WHEN i.value_status <> 'suppressed' THEN 1 ELSE 0 END) / count(i.id), 1) AS completeness_pct,
            count(DISTINCT i.state || '|' || i.area) AS geographies
       FROM public_sources s JOIN public_indicators i ON i.source_id = s.source_id
      GROUP BY s.source_id ORDER BY s.source_id`,
  );
}

export interface StateSnapshot {
  state: string;
  facts: { indicator: IndicatorDefView; value: number | null; reference_period: string; source_id: string; locator: string }[];
}

const SNAPSHOT_IDS = ["udise_schools_total", "udise_teachers_total", "udise_enrolment_total", "udise_ptr", "udise_single_teacher_schools", "udise_infra_internet_share"];

/** A handful of headline school-system facts for one state (UDISE+ only). */
export function stateSnapshot(db: Db, state: string): StateSnapshot {
  const facts = SNAPSHOT_IDS.flatMap((id) => {
    const v = valuesFor(db, id, { level: "state", state })[0];
    if (!v) return [];
    return [{ indicator: getIndicatorDef(db, id), value: v.value, reference_period: v.reference_period, source_id: v.source_id, locator: v.source_locator }];
  });
  return { state, facts };
}
