import Link from "next/link";
import { ClipboardList, Search } from "lucide-react";
import { db, requireActor } from "@/lib/server/context";
import { listVisits } from "@/lib/services/visits";
import { fmtDate, fmtTime, VISIT_STATUS_LABEL, visitStatusKey } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { classLabel } from "@/lib/visit-labels";
import { Button, Card, Chip, EmptyState, LinkButton, PageHeader, Pagination, VisitStatusChip } from "@/components/ui";
import { Input, Select } from "@/components/forms";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("visits.title") };
}

export default async function VisitsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireActor(["mentor", "supervisor"]);
  const { t, locale } = await getI18n();
  const sp = await searchParams;
  const page = Number(sp.page ?? 1) || 1;
  const status = sp.status && sp.status in VISIT_STATUS_LABEL ? sp.status : undefined;
  const result = listVisits(db(), actor, { q: sp.q, status, page, pageSize: 10 });
  const isMentor = actor.role === "mentor";
  const qs = (p: number) => {
    const u = new URLSearchParams();
    if (sp.q) u.set("q", sp.q);
    if (status) u.set("status", status);
    u.set("page", String(p));
    return `/visits?${u}`;
  };

  return (
    <>
      <PageHeader
        title={t("visits.title")}
        description={isMentor ? t("visits.list.descMentor") : t("visits.list.descSupervisor")}
        actions={isMentor ? <LinkButton href="/visits/new">{t("visits.list.plan")}</LinkButton> : undefined}
      />
      <form className="mb-5 grid gap-3 rounded-xl border border-line bg-card p-4 sm:grid-cols-[1fr_13rem_auto]" role="search" aria-label={t("visits.list.filterLabel")}>
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-3 text-ink-500" aria-hidden />
          <Input name="q" defaultValue={sp.q} placeholder={t("visits.list.searchPlaceholder")} aria-label={t("visits.list.searchLabel")} className="pl-9" />
        </div>
        <Select name="status" defaultValue={status ?? ""} aria-label={t("visits.list.statusLabel")}>
          <option value="">{t("visits.list.allStatuses")}</option>
          {Object.keys(VISIT_STATUS_LABEL).map((k) => <option key={k} value={k}>{t(visitStatusKey(k))}</option>)}
        </Select>
        <Button type="submit" variant="secondary">{t("common.apply")}</Button>
      </form>

      {result.items.length === 0 ? (
        <EmptyState icon={<ClipboardList size={28} />} title={t("visits.list.emptyTitle")} description={t("visits.list.emptyDesc")} action={isMentor ? <LinkButton href="/visits/new">{t("visits.list.plan")}</LinkButton> : <LinkButton href="/visits" variant="secondary">{t("visits.list.clearFilters")}</LinkButton>} />
      ) : (
        <Card className="overflow-hidden">
          <div className="relative overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{t("visits.title")}</caption>
              <thead className="bg-ink-50 text-[12px] uppercase tracking-wide text-ink-600">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">{t("visits.list.col.date")}</th>
                  <th scope="col" className="px-4 py-3 font-medium">{t("visits.list.col.school")}</th>
                  <th scope="col" className="px-4 py-3 font-medium">{t("visits.list.col.class")}</th>
                  {isMentor && <th scope="col" className="px-4 py-3 font-medium">{t("visits.list.col.teacher")}</th>}
                  {!isMentor && <th scope="col" className="px-4 py-3 font-medium">{t("visits.list.col.mentor")}</th>}
                  <th scope="col" className="px-4 py-3 font-medium">{t("visits.list.col.status")}</th>
                  <th scope="col" className="px-4 py-3 font-medium">{t("visits.list.col.feedback")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {result.items.map((v) => (
                  <tr key={v.id} className="hover:bg-ink-50/60">
                    <td className="px-5 py-3.5">
                      {isMentor ? <Link href={`/visits/${v.id}`} className="font-medium hover:underline">{fmtDate(v.scheduled_at, locale)}</Link> : <span className="font-medium">{fmtDate(v.scheduled_at, locale)}</span>}
                      <div className="text-[12px] text-ink-600">{fmtTime(v.scheduled_at, locale)}</div>
                    </td>
                    <td className="px-4 py-3.5">{v.school_name}</td>
                    <td className="px-4 py-3.5">{classLabel(t, v.grade, v.subject)}</td>
                    <td className="px-4 py-3.5 text-ink-700">{isMentor ? v.teacher_alias : v.mentor_name}</td>
                    <td className="px-4 py-3.5"><VisitStatusChip status={v.status} /></td>
                    <td className="px-4 py-3.5">
                      {v.has_approved_feedback ? <Chip tone="teal">{t("common.status.feedback.approved")}</Chip> : v.has_pending_feedback ? <Chip tone="amber">{t("visits.list.awaiting")}</Chip> : <span className="text-ink-500">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <Pagination page={result.page} pageSize={result.pageSize} total={result.total} hrefFor={qs} />
    </>
  );
}
