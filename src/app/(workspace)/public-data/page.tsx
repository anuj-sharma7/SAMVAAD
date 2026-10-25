import Link from "next/link";
import { AlertTriangle, Info } from "lucide-react";
import { db, requireActor } from "@/lib/server/context";
import {
  freshness, getIndicatorDef, listIndicatorDefs, listSources, periodsFor, stateSnapshot, statesWithData, valuesFor, type ValueView,
} from "@/lib/services/public-context";
import { fmtDate, fmtNumber } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { ingestLabel } from "@/lib/public-status";
import { Button, Card, CardHeader, Chip, EmptyState, LinkButton, Notice, PageHeader } from "@/components/ui";
import { Field, Select } from "@/components/forms";
import { BarList, NotObservationsNotice, PublicDataBadge, SourceCitation, ViewToggle, rich, type BarRow } from "@/components/public-data";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("publicdata.meta.title") };
}

const SOURCE_PRIORITY = ["_state", "_district", "_divisional"];

/** When one geography has the same value from several files, keep one: state page, then district table, then divisional. */
function bestPerGeography(rows: ValueView[]): ValueView[] {
  const rank = (r: ValueView) => { const i = SOURCE_PRIORITY.findIndex((s) => r.source_id.includes(s)); return i === -1 ? 0 : i; };
  const m = new Map<string, ValueView>();
  for (const r of [...rows].sort((a, b) => rank(a) - rank(b))) {
    const k = [r.state, r.area, r.reference_period].join("|");
    if (!m.has(k)) m.set(k, r);
  }
  return [...m.values()];
}

export default async function PublicDataPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireActor();
  const { t, locale } = await getI18n();
  const nf = (n: number) => fmtNumber(n, locale, { maximumFractionDigits: 1 });
  const sp = await searchParams;
  const database = db();
  const states = statesWithData(database);
  const defs = listIndicatorDefs(database);
  const fresh = freshness(database);
  const sources = listSources(database);

  if (defs.length === 0) {
    const status = fresh.lastIngestion ? ingestLabel(t, fresh.lastIngestion.status) : t("publicdata.ingest.neverRun");
    return (
      <>
        <PageHeader title={t("publicdata.title")} description={t("publicdata.description.short")} actions={<ViewToggle active="public" />} />
        <EmptyState
          title={t("publicdata.empty.title")}
          description={<>{rich(t("publicdata.empty.description", { status, detail: fresh.lastIngestion?.detail ?? "" }), {
            cmd: <code>npm run data:refresh</code>,
            link: <Link className="underline" href="/public-data/sources">{t("publicdata.sourceCatalogue")}</Link>,
          })}</>}
          action={<LinkButton href="/public-data/sources" variant="secondary">{t("publicdata.empty.openCatalogue")}</LinkButton>}
        />
      </>
    );
  }

  const state = states.includes(sp.state ?? "") ? (sp.state as string) : states.includes("Rajasthan") ? "Rajasthan" : states[0];
  const indicatorId = defs.some((d) => d.indicator_id === sp.indicator) ? (sp.indicator as string) : "aser_std3_read_std2";
  const def = getIndicatorDef(database, indicatorId);
  const periods = periodsFor(database, indicatorId);
  const period = periods.includes(sp.period ?? "") ? (sp.period as string) : periods[0];
  const srcName = (id: string) => sources.find((s) => s.source_id === id)?.source_name ?? id;
  const retrieved = (id: string) => sources.find((s) => s.source_id === id)?.retrieved_at_utc ?? null;

  const snapshot = stateSnapshot(database, state);
  const stateRows = bestPerGeography([...valuesFor(database, indicatorId, { level: "state", period }), ...valuesFor(database, indicatorId, { level: "national", period })]);
  const compare: BarRow[] = stateRows
    .map((r) => ({ label: r.geography_level === "national" ? t("publicdata.india") : r.state, value: r.value, highlight: r.state === state, ci: r.ci95_half_width, sourceId: r.source_id, sourceName: srcName(r.source_id) }))
    .sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
  const compareSource = stateRows[0];

  const districtRows = bestPerGeography(valuesFor(database, indicatorId, { level: "district", state, period }));
  const divisionRows = bestPerGeography(valuesFor(database, indicatorId, { level: "division", state, period }));
  const infraDefs = defs.filter((d) => d.indicator_id.startsWith("udise_infra_") && d.indicator_id.endsWith("_share"));
  const infraRows = infraDefs.map((d) => ({
    def: d,
    state: valuesFor(database, d.indicator_id, { level: "state", state })[0],
    india: valuesFor(database, d.indicator_id, { level: "national" })[0],
  }));
  const snapshotPeriods = new Set(snapshot.facts.map((f) => f.reference_period));
  const mixed = snapshotPeriods.size > 0 && !snapshotPeriods.has(period) && def.survey_type !== "school_census";
  const notPublished = t("publicdata.chart.notPublished");

  return (
    <>
      <PageHeader
        title={t("publicdata.title")}
        description={t("publicdata.description")}
        actions={<ViewToggle active="public" />}
      />
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <PublicDataBadge />
        <NotObservationsNotice />
        <span className="text-[13px] text-ink-600">
          {rich(t("publicdata.lastImport", {
            when: "{when}",
            retrieved: fresh.newestRetrieval ? t("publicdata.lastImport.retrieved", { date: fmtDate(fresh.newestRetrieval, locale) }) : "",
          }), { when: <strong>{fresh.lastSuccessful ? fmtDate(fresh.lastSuccessful.finished_at, locale) : t("common.rel.never")}</strong> })} ·{" "}
          <Link href="/public-data/sources" className="underline">{t("publicdata.sourceCatalogue")}</Link>
        </span>
        {fresh.lastIngestion && fresh.lastIngestion.status === "rejected" && <Chip tone="red">{t("publicdata.latestRejected")}</Chip>}
      </div>

      <form className="mb-6 grid gap-3 rounded-xl border border-line bg-card p-4 md:grid-cols-[12rem_1fr_11rem_auto]" role="search" aria-label={t("publicdata.filter.aria")}>
        <Field label={t("publicdata.filter.state")} htmlFor="state">
          <Select id="state" name="state" defaultValue={state}>{states.map((s) => <option key={s}>{s}</option>)}</Select>
        </Field>
        <Field label={t("publicdata.filter.indicator")} htmlFor="indicator">
          <Select id="indicator" name="indicator" defaultValue={indicatorId}>
            {(["learning", "enrolment", "school_system", "infrastructure"] as const).map((dom) => (
              <optgroup key={dom} label={t(`publicdata.domain.${dom}`)}>
                {defs.filter((d) => d.domain === dom && !/^udise_infra_.*_schools$/.test(d.indicator_id)).map((d) => <option key={d.indicator_id} value={d.indicator_id}>{d.label}</option>)}
              </optgroup>
            ))}
          </Select>
        </Field>
        <Field label={t("publicdata.filter.period")} htmlFor="period">
          <Select id="period" name="period" defaultValue={period}>{periods.map((p) => <option key={p}>{p}</option>)}</Select>
        </Field>
        <div className="self-end"><Button type="submit" variant="secondary">{t("common.apply")}</Button></div>
      </form>

      {mixed && (
        <Notice tone="warning" title={t("publicdata.mixed.title")} className="mb-6">
          {t("publicdata.mixed.body", { snapshot: [...snapshotPeriods].join(", "), period })}
        </Notice>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader title={t("publicdata.snapshot.title", { state })} description={t("publicdata.snapshot.description")} action={<PublicDataBadge label={t("publicdata.badge.public")} />} />
          {snapshot.facts.length === 0 ? (
            <p className="p-5 text-sm text-ink-600">{t("publicdata.snapshot.empty", { state })}</p>
          ) : (
            <dl className="divide-y divide-line">
              {snapshot.facts.map((f) => (
                <div key={f.indicator.indicator_id} className="px-5 py-3">
                  <dt className="text-[13px] text-ink-600">{f.indicator.label}</dt>
                  <dd>
                    <span className="block text-xl font-semibold tracking-tight">{f.value === null ? notPublished : nf(f.value)} <span className="text-[13px] font-normal text-ink-600">{f.indicator.unit}</span></span>
                    <SourceCitation cite={{ source_id: f.source_id, source_name: srcName(f.source_id), reference_period: f.reference_period, geography_level: "state", locator: f.locator, retrieved: retrieved(f.source_id) }} />
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </Card>

        <Card>
          <CardHeader title={def.label} description={def.description} action={<PublicDataBadge label={t("publicdata.badge.public")} />} />
          <div className="space-y-6 p-5">
            {compare.length === 0 ? (
              <p className="text-sm text-ink-600">{t("publicdata.indicator.noValues")}</p>
            ) : (
              <BarList
                title={t("publicdata.indicator.compareTitle", { label: def.label })}
                unit={def.unit}
                geography={def.survey_type === "household_sample_survey" ? t("publicdata.indicator.geoSurvey") : t("publicdata.indicator.geoCensus")}
                caption={t("publicdata.indicator.caption", { n: compare.filter((c) => c.value !== null).length, total: compare.length, period })}
                rows={compare}
                max={def.unit.startsWith("%") ? 100 : undefined}
                source={{ source_id: compareSource.source_id, source_name: srcName(compareSource.source_id), reference_period: period, geography_level: "state", locator: compareSource.source_locator, retrieved: retrieved(compareSource.source_id) }}
              />
            )}
            <div className="flex gap-2 rounded-lg bg-ink-50 p-3 text-[13px] text-ink-700">
              <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
              <p><strong>{t("publicdata.indicator.howToRead")}</strong> {def.caveat} {states.length < 36 && def.survey_type === "household_sample_survey" ? t("publicdata.indicator.onlyStates", { n: states.length }) : ""}</p>
            </div>
          </div>
        </Card>
      </div>

      {(districtRows.length > 0 || divisionRows.length > 0) && (
        <Card className="mt-6">
          <CardHeader title={t("publicdata.within.title", { state })} description={t("publicdata.within.description")} action={<PublicDataBadge label={t("publicdata.badge.public")} />} />
          <div className="grid grid-cols-[minmax(0,1fr)] gap-8 p-5 lg:grid-cols-2">
            {divisionRows.length > 0 && (
              <BarList
                title={t("publicdata.within.byDivision", { label: def.label })}
                unit={def.unit}
                geography={t("publicdata.within.geoDivision", { state })}
                caption={`${period}`}
                rows={divisionRows.map((r) => ({ label: r.area, value: r.value, ci: r.ci95_half_width })).sort((a, b) => (b.value ?? -1) - (a.value ?? -1))}
                max={100}
                source={{ source_id: divisionRows[0].source_id, source_name: srcName(divisionRows[0].source_id), reference_period: period, geography_level: "division", locator: divisionRows[0].source_locator, retrieved: retrieved(divisionRows[0].source_id) }}
              />
            )}
            {districtRows.length > 0 && (
              <BarList
                title={t("publicdata.within.byDistrict", { label: def.label })}
                unit={def.unit}
                geography={t("publicdata.within.geoDistrict", { state })}
                caption={t("publicdata.within.districtCaption", { n: districtRows.filter((r) => r.value !== null).length, total: districtRows.length })}
                rows={districtRows.map((r) => ({ label: r.area, value: r.value, note: r.notes || undefined })).sort((a, b) => (b.value ?? -1) - (a.value ?? -1))}
                max={100}
                source={{ source_id: districtRows[0].source_id, source_name: srcName(districtRows[0].source_id), reference_period: period, geography_level: "district", locator: districtRows[0].source_locator, retrieved: retrieved(districtRows[0].source_id) }}
              />
            )}
          </div>
          <p className="flex gap-2 border-t border-line px-5 py-3 text-[12px] text-ink-600"><AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden /> {t("publicdata.within.warning")}</p>
        </Card>
      )}
      {districtRows.length === 0 && divisionRows.length === 0 && def.survey_type === "household_sample_survey" && (
        <Notice className="mt-6" tone="info" title={t("publicdata.within.noneTitle")}>
          {t("publicdata.within.noneBody", { state })}
        </Notice>
      )}

      <Card className="mt-6">
        <CardHeader title={t("publicdata.infra.title", { state })} description={t("publicdata.infra.description")} action={<PublicDataBadge label={t("publicdata.badge.public")} />} />
        <div className="relative overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{t("publicdata.infra.caption", { state })}</caption>
            <thead className="bg-ink-50 text-[12px] uppercase tracking-wide text-ink-600"><tr><th scope="col" className="px-5 py-2.5 font-medium">{t("publicdata.infra.colFacility")}</th><th scope="col" className="px-4 py-2.5 font-medium">{t("publicdata.infra.colState", { state })}</th><th scope="col" className="px-4 py-2.5 font-medium">{t("publicdata.infra.colIndia")}</th></tr></thead>
            <tbody className="divide-y divide-line">
              {infraRows.map(({ def: d, state: s, india }) => (
                <tr key={d.indicator_id}>
                  <th scope="row" className="px-5 py-2.5 font-normal">{d.label.replace("Share of schools with ", "Schools with ")}</th>
                  <td className="px-4 py-2.5 tabular-nums">{s?.value === null || s === undefined ? notPublished : nf(s.value!)}</td>
                  <td className="px-4 py-2.5 tabular-nums">{india?.value === null || india === undefined ? notPublished : nf(india.value!)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-line px-5 py-3">
          <SourceCitation cite={{ source_id: "udise_2024_25_booklet", source_name: srcName("udise_2024_25_booklet"), reference_period: "UDISE+ 2024-25", geography_level: "state", locator: t("publicdata.infra.locator"), retrieved: retrieved("udise_2024_25_booklet") }} />
          <p className="mt-1 text-[12px] text-ink-600">{t("publicdata.infra.note")}</p>
        </div>
      </Card>

      <p className="mt-6 text-xs text-ink-600">{t("publicdata.footer")}</p>
    </>
  );
}
