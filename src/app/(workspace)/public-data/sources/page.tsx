import Link from "next/link";
import { db, requireActor } from "@/lib/server/context";
import { freshness, listSources, sourceQuality } from "@/lib/services/public-context";
import { fmtDate, fmtDateTime, fmtNumber } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { Card, CardHeader, Chip, EmptyState, Notice, PageHeader } from "@/components/ui";
import { STATUS, accessLabel, accessMeaning, geoLabel, ingestLabel } from "@/lib/public-status";
import { NotObservationsNotice, PublicDataBadge, ViewToggle, rich } from "@/components/public-data";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("publicdata.meta.sources") };
}

export default async function SourcesPage() {
  await requireActor();
  const { t, locale } = await getI18n();
  const sources = listSources(db());
  const fresh = freshness(db());
  const quality = sourceQuality(db());
  const counts = Object.entries(Object.groupBy(sources, (s) => s.access_status)).map(([k, v]) => [k, v?.length ?? 0] as const);

  if (sources.length === 0) {
    return (
      <>
        <PageHeader title={t("publicdata.meta.sources")} actions={<ViewToggle active="public" />} />
        <EmptyState title={t("publicdata.sources.emptyTitle")} description={t("publicdata.sources.emptyDescription")} />
      </>
    );
  }
  const blocked = sources.filter((s) => ["manual_download_needed", "registration_or_request_required", "captcha_or_interaction_blocked", "unavailable"].includes(s.access_status));

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/public-data", label: t("publicdata.title") }, { label: t("publicdata.sources.crumb") }]}
        title={t("publicdata.sources.title")}
        description={t("publicdata.sources.description")}
        actions={<ViewToggle active="public" />}
      />
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <PublicDataBadge /> <NotObservationsNotice />
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card className="p-4"><p className="text-[13px] text-ink-600">{t("publicdata.sources.lastSuccess")}</p><p className="mt-1 text-lg font-semibold">{fresh.lastSuccessful ? fmtDateTime(fresh.lastSuccessful.finished_at, locale) : t("publicdata.sources.never")}</p><p className="text-[13px] text-ink-600">{fresh.lastSuccessful ? t("publicdata.sources.values", { n: fmtNumber(fresh.lastSuccessful.rows_imported, locale) }) : ""}</p></Card>
        <Card className="p-4"><p className="text-[13px] text-ink-600">{t("publicdata.sources.latestAttempt")}</p><p className="mt-1 text-lg font-semibold capitalize">{fresh.lastIngestion ? ingestLabel(t, fresh.lastIngestion.status) : t("publicdata.ingest.none")}</p><p className="text-[13px] text-ink-600">{fresh.lastIngestion ? t("publicdata.sources.checks", { passed: fresh.lastIngestion.checks_passed ?? "?", total: fresh.lastIngestion.checks_total ?? "?" }) : ""}</p></Card>
        <Card className="p-4"><p className="text-[13px] text-ink-600">{t("publicdata.sources.filesRetrieved")}</p><p className="mt-1 text-lg font-semibold">{fresh.oldestRetrieval ? `${fmtDate(fresh.oldestRetrieval, locale)} – ${fmtDate(fresh.newestRetrieval, locale)}` : "—"}</p><p className="text-[13px] text-ink-600">{t("publicdata.sources.snapshot")}</p></Card>
      </div>

      <Card className="mb-6">
        <CardHeader title={t("publicdata.sources.summary")} />
        <ul className="flex flex-wrap gap-2 p-5">
          {counts.map(([k, n]) => <li key={k}><Chip tone={STATUS[k]?.tone ?? "neutral"} title={accessMeaning(t, k)}>{accessLabel(t, k)}: {fmtNumber(n, locale)}</Chip></li>)}
        </ul>
      </Card>

      <Card className="mb-6">
        <CardHeader title={t("publicdata.sources.listTitle")} description={t("publicdata.sources.listDescription")} />
        <div className="relative overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{t("publicdata.sources.listCaption")}</caption>
            <thead className="bg-ink-50 text-[12px] uppercase tracking-wide text-ink-600">
              <tr>
                <th scope="col" className="px-5 py-3 font-medium">{t("publicdata.sources.colSource")}</th><th scope="col" className="px-4 py-3 font-medium">{t("publicdata.sources.colPeriod")}</th><th scope="col" className="px-4 py-3 font-medium">{t("publicdata.sources.colGeography")}</th>
                <th scope="col" className="px-4 py-3 font-medium">{t("publicdata.sources.colStatus")}</th><th scope="col" className="px-4 py-3 font-medium">{t("publicdata.sources.colRetrieved")}</th><th scope="col" className="px-4 py-3 font-medium">{t("publicdata.sources.colRows")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sources.map((s) => (
                <tr key={s.source_id} className="align-top hover:bg-ink-50/60">
                  <td className="px-5 py-3"><Link href={`/public-data/sources/${s.source_id}`} className="font-medium hover:underline">{s.source_name}</Link><div className="text-[12px] text-ink-600">{s.publisher}</div></td>
                  <td className="px-4 py-3 text-ink-700">{s.reference_period}</td>
                  <td className="px-4 py-3 text-ink-700">{geoLabel(t, s.geography_level)}<div className="text-[12px] text-ink-600">{s.geography_coverage}</div></td>
                  <td className="px-4 py-3"><Chip tone={STATUS[s.access_status]?.tone ?? "neutral"}>{accessLabel(t, s.access_status)}</Chip></td>
                  <td className="px-4 py-3 text-ink-700">{s.retrieved_at_utc ? fmtDate(s.retrieved_at_utc, locale) : "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{s.row_count !== null && s.row_count !== undefined ? fmtNumber(Number(s.row_count), locale) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mb-6">
        <CardHeader title={t("publicdata.quality.title")} description={t("publicdata.quality.description")} />
        <div className="relative overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{t("publicdata.quality.caption")}</caption>
            <thead className="bg-ink-50 text-[12px] uppercase tracking-wide text-ink-600"><tr><th scope="col" className="px-5 py-2.5 font-medium">{t("publicdata.sources.colSource")}</th><th scope="col" className="px-4 py-2.5 font-medium">{t("publicdata.quality.colValues")}</th><th scope="col" className="px-4 py-2.5 font-medium">{t("publicdata.quality.colSuppressed")}</th><th scope="col" className="px-4 py-2.5 font-medium">{t("publicdata.quality.colCompleteness")}</th><th scope="col" className="px-4 py-2.5 font-medium">{t("publicdata.quality.colGeographies")}</th></tr></thead>
            <tbody className="divide-y divide-line">
              {quality.map((q) => <tr key={q.source_id}><th scope="row" className="px-5 py-2 font-normal"><Link className="hover:underline" href={`/public-data/sources/${q.source_id}`}>{q.source_name}</Link></th><td className="px-4 py-2 tabular-nums">{fmtNumber(q.rows, locale)}</td><td className="px-4 py-2 tabular-nums">{fmtNumber(q.suppressed, locale)}</td><td className="px-4 py-2 tabular-nums">{fmtNumber(q.completeness_pct, locale)}%</td><td className="px-4 py-2 tabular-nums">{fmtNumber(q.geographies, locale)}</td></tr>)}
            </tbody>
          </table>
        </div>
      </Card>

      {blocked.length > 0 && (
        <Notice tone="warning" title={t("publicdata.blocked.title")}>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {blocked.map((s) => <li key={s.source_id}><strong>{s.source_name}</strong>: {s.access_detail}</li>)}
          </ul>
          <p className="mt-2">{rich(t("publicdata.blocked.body"), { doc: <code>docs/data_access_requests.md</code> })}</p>
        </Notice>
      )}
    </>
  );
}
