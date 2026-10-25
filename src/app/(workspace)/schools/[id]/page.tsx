import { subjectLabel } from "@/lib/visit-labels";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import { db, requireActor, safe } from "@/lib/server/context";
import { getSchool, schoolExtras } from "@/lib/services/schools";
import { listReports } from "@/lib/services/reports";
import { fmtDate, relativeDaysT } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { Card, CardHeader, CommitmentChip, DefinitionRow, DemoTag, EmptyState, LinkButton, PageHeader, VisitStatusChip } from "@/components/ui";

export default async function SchoolDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const i = await getI18n();
  const { t, locale } = i;
  const withRel = (d: string) => t("schools.detail.dateWithRelative", { date: fmtDate(d, locale), relative: relativeDaysT(d, i) });
  const actor = await requireActor();
  const r = safe(() => getSchool(db(), actor, id));
  if (!r.ok) notFound();
  const school = r.value;
  const { visits, commitments } = schoolExtras(db(), actor, id);
  const reports = actor.role === "mentor" ? listReports(db(), actor).filter((x) => visits.some((v) => v.id === x.visit_id) && x.report_status !== "none") : [];
  const isMentor = actor.role === "mentor";

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/schools", label: t("schools.title") }, { label: school.name }]}
        title={school.name}
        description={`${school.block} · ${school.cluster ?? "—"} · ${school.district}, ${school.state}`}
        actions={isMentor ? <LinkButton href={`/visits/new?school=${school.id}`}><CalendarPlus size={16} aria-hidden /> {t("schools.detail.newVisitHere")}</LinkButton> : undefined}
      />

      <div className="grid gap-6 grid-cols-[minmax(0,1fr)] lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title={t("schools.detail.profile")} action={school.is_demo ? <DemoTag /> : undefined} />
            <dl className="divide-y divide-line px-5">
              <DefinitionRow label={t("schools.detail.code")}><span className="font-mono text-[13px]">{school.code}</span></DefinitionRow>
              <DefinitionRow label={t("schools.detail.blockCluster")}>{school.block} / {school.cluster ?? "—"}</DefinitionRow>
              <DefinitionRow label={t("schools.col.mentor")}>{school.mentors ?? t("schools.unassigned")}</DefinitionRow>
              <DefinitionRow label={t("schools.col.lastVisit")}>{school.last_visit_at ? withRel(school.last_visit_at) : t("schools.noneYet")}</DefinitionRow>
              <DefinitionRow label={t("schools.col.nextVisit")}>{school.next_visit_at ? withRel(school.next_visit_at) : t("schools.notScheduled")}</DefinitionRow>
            </dl>
            <p className="border-t border-line px-5 py-3 text-xs text-ink-600">{t("schools.detail.profileNote")}</p>
          </Card>

          {isMentor && (
            <Card>
              <CardHeader title={t("schools.detail.commitments.title")} description={t("schools.detail.commitments.description")} />
              {commitments.filter((c) => ["open", "completed"].includes(c.status)).length === 0 ? (
                <p className="p-5 text-sm text-ink-600">{t("schools.detail.commitments.empty")}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {commitments.filter((c) => ["open", "completed"].includes(c.status)).map((c) => (
                    <li key={c.id} className="px-5 py-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium" lang={/[ऀ-ॿ]/.test(c.action_text) ? "hi" : undefined}>{c.action_text}</p>
                        <CommitmentChip status={c.display_status} />
                      </div>
                      <p className="mt-1 text-[13px] text-ink-600">{t("schools.detail.commitments.line", { teacher: c.teacher_alias, date: fmtDate(c.target_date, locale), relative: relativeDaysT(c.target_date, i) })}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title={t("schools.detail.history.title")} description={isMentor ? t("schools.detail.history.mentor") : t("schools.detail.history.other")} />
            {visits.length === 0 ? (
              <div className="p-5"><EmptyState title={t("schools.detail.history.emptyTitle")} description={t("schools.detail.history.emptyDescription")} action={isMentor ? <LinkButton href={`/visits/new?school=${school.id}`}>{t("schools.planVisit")}</LinkButton> : undefined} /></div>
            ) : (
              <ul className="divide-y divide-line">
                {visits.map((v) => {
                  const row = (
                    <div className="flex items-center gap-4 px-5 py-3.5">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{t("schools.detail.visitTitle", { date: fmtDate(v.scheduled_at, locale), grade: v.grade, subject: subjectLabel(t, v.subject) })}</p>
                        <p className="text-[13px] text-ink-600">{isMentor ? `${v.teacher_alias} · ${v.purpose}` : t("schools.detail.visitMentorLine", { name: v.mentor_name })}</p>
                      </div>
                      <VisitStatusChip status={v.status} />
                    </div>
                  );
                  return <li key={v.id}>{isMentor ? <Link href={`/visits/${v.id}`} className="block hover:bg-ink-50">{row}</Link> : row}</li>;
                })}
              </ul>
            )}
          </Card>

          {isMentor && (
            <Card>
              <CardHeader title={t("schools.detail.reports.title")} />
              {reports.length === 0 ? <p className="p-5 text-sm text-ink-600">{t("schools.detail.reports.empty")}</p> : (
                <ul className="divide-y divide-line">
                  {reports.map((r) => (
                    <li key={r.visit_id}>
                      <Link href={`/visits/${r.visit_id}/report`} className="flex items-center justify-between px-5 py-3.5 hover:bg-ink-50">
                        <span className="text-sm">{t("schools.detail.visitTitle", { date: fmtDate(r.scheduled_at, locale), grade: r.grade, subject: subjectLabel(t, r.subject) })}</span>
                        <span className="text-[13px] text-ink-600">{r.report_status === "finalized" ? t("schools.detail.reports.finalized") : t("schools.detail.reports.draft")}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
