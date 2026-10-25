import Link from "next/link";
import { Download, FileText } from "lucide-react";
import { db, requireActor } from "@/lib/server/context";
import { listReports } from "@/lib/services/reports";
import { fmtDate } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { classLabel } from "@/lib/visit-labels";
import { Card, Chip, EmptyState, LinkButton, PageHeader, VisitStatusChip, cn } from "@/components/ui";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("visits.index.reportsTitle") };
}

const FILTERS = [["all", "visits.index.filterAll"], ["draft", "visits.index.filterDraft"], ["finalized", "visits.index.filterFinalized"], ["none", "visits.index.filterNone"]] as const;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const actor = await requireActor(["mentor"]);
  const { t, locale } = await getI18n();
  const sp = await searchParams;
  const status = FILTERS.some(([k]) => k === sp.status) && sp.status !== "all" ? sp.status : undefined;
  const rows = listReports(db(), actor, { status });
  return (
    <>
      <PageHeader
        title={t("visits.index.reportsTitle")}
        description={t("visits.index.reportsDesc")}
        actions={
          // eslint-disable-next-line @next/next/no-html-link-for-pages -- file download from an API route, not a page navigation
          <a href="/api/v1/reports/export" className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-card px-4 text-sm font-medium hover:bg-ink-50"><Download size={16} aria-hidden /> {t("visits.index.export")}</a>
        }
      />
      <nav aria-label={t("visits.index.filterReports")} className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map(([k, labelKey]) => {
          const active = (status ?? "all") === k;
          return <Link key={k} href={k === "all" ? "/reports" : `/reports?status=${k}`} aria-current={active ? "page" : undefined} className={cn("rounded-full border px-3.5 py-1.5 text-sm", active ? "border-ink-900 bg-ink-900 text-white" : "border-line-strong bg-card text-ink-700 hover:bg-ink-50")}>{t(labelKey)}</Link>;
        })}
      </nav>
      {rows.length === 0 ? (
        <EmptyState icon={<FileText size={28} />} title={t("visits.index.reportsEmptyTitle")} description={t("visits.index.reportsEmptyDesc")} action={<LinkButton href="/visits">{t("visits.index.goVisits")}</LinkButton>} />
      ) : (
        <Card className="overflow-hidden">
          <div className="relative overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{t("visits.index.reportsCaption")}</caption>
              <thead className="bg-ink-50 text-[12px] uppercase tracking-wide text-ink-600"><tr>
                <th scope="col" className="px-5 py-3 font-medium">{t("visits.index.col.visit")}</th><th scope="col" className="px-4 py-3 font-medium">{t("visits.index.col.class")}</th><th scope="col" className="px-4 py-3 font-medium">{t("visits.index.col.teacher")}</th>
                <th scope="col" className="px-4 py-3 font-medium">{t("visits.index.col.visitStatus")}</th><th scope="col" className="px-4 py-3 font-medium">{t("visits.index.col.report")}</th><th scope="col" className="px-4 py-3"><span className="sr-only">{t("visits.index.col.open")}</span></th>
              </tr></thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.visit_id} className="hover:bg-ink-50/60">
                    <td className="px-5 py-3.5"><span className="font-medium">{r.school_name}</span><div className="text-[12px] text-ink-600">{fmtDate(r.scheduled_at, locale)}</div></td>
                    <td className="px-4 py-3.5">{classLabel(t, r.grade, r.subject)}</td>
                    <td className="px-4 py-3.5">{r.teacher_alias}</td>
                    <td className="px-4 py-3.5"><VisitStatusChip status={r.visit_status} /></td>
                    <td className="px-4 py-3.5">{r.report_status === "finalized" ? <Chip tone="teal">{t("visits.index.finalized", { date: fmtDate(r.finalized_at, locale) })}</Chip> : r.report_status === "draft" ? <Chip tone="amber">{t("visits.index.reportDraft")}</Chip> : <Chip>{t("visits.index.reportNone")}</Chip>}</td>
                    <td className="px-4 py-3.5 text-right"><LinkButton size="sm" variant="secondary" href={`/visits/${r.visit_id}/report`}>{r.report_status === "finalized" ? t("common.view") : t("common.open")}</LinkButton></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
