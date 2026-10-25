import { subjectLabel } from "@/lib/visit-labels";
import Link from "next/link";
import { ArrowRight, CalendarClock, CalendarPlus, CircleAlert, ClipboardCheck, Clock3, FileCheck2, History, ListChecks, MessageSquareText } from "lucide-react";
import { db, requireActor } from "@/lib/server/context";
import { getDashboard, PILOT_TARGETS, type AdminDashboard, type MentorDashboard, type SupervisorDashboard } from "@/lib/services/dashboard";
import { auditKey, fmtDate, fmtDay, fmtNumber, fmtTime, relativeDaysT } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import type { Translator } from "@/lib/i18n/translate";
import type { PriorityReason } from "@/lib/engines/prioritizer";
import { Card, CardHeader, Chip, CommitmentChip, EmptyState, LinkButton, Notice, PageHeader, VisitStatusChip, cn } from "@/components/ui";
import { MIN_GROUP_SIZE } from "@/lib/auth/policy";
import { ViewToggle, PublicDataBadge, SourceCitation } from "@/components/public-data";
import { stateSnapshot, statesWithData } from "@/lib/services/public-context";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("dashboard.meta.title") };
}

/** Translated priority reason; falls back to the engine's English text if no message exists. */
function reasonText(i: Translator, r: PriorityReason): string {
  const key = `dashboard.reason.${r.code}`;
  const n = r.params.n;
  const out = typeof n === "number" ? i.tp(key, n, r.params) : i.t(key, r.params);
  return out === key || out === `${key}_one` || out === `${key}_other` ? r.text : out;
}

export default async function DashboardPage() {
  const actor = await requireActor();
  const i = await getI18n();
  const data = getDashboard(db(), actor);
  if (data.kind === "mentor") return <MentorView data={data} name={actor.displayName} i={i} />;
  if (data.kind === "supervisor") return <SupervisorView data={data} i={i} />;
  return <AdminView data={data} i={i} />;
}

function StatCard({ href, label, value, icon: Icon, tone = "neutral" }: { href: string; label: string; value: number; icon: typeof Clock3; tone?: "neutral" | "amber" | "red" | "teal" }) {
  const toneCls = { neutral: "text-ink-700 bg-ink-50", amber: "text-amber-800 bg-amber-50", red: "text-red-700 bg-red-50", teal: "text-teal-700 bg-teal-50" }[tone];
  return (
    <Link href={href} className="group rounded-xl border border-line bg-card p-4 transition hover:border-ink-700 hover:shadow-sm">
      <div className="flex items-center justify-between">
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", toneCls)}><Icon size={17} aria-hidden /></span>
        <ArrowRight size={15} className="text-ink-500 opacity-0 transition group-hover:opacity-100" aria-hidden />
      </div>
      <p className="mt-3 text-[28px] font-semibold leading-none tracking-tight text-ink-900">{value}</p>
      <p className="mt-1.5 text-[13px] text-ink-600">{label}</p>
    </Link>
  );
}

function MentorView({ data, name, i }: { data: MentorDashboard; name: string; i: Translator }) {
  const { t, tp, locale } = i;
  const c = data.counts;
  const first = name.split(" ")[0];
  const w = data.workflow;
  return (
    <>
      <PageHeader
        title={t("dashboard.mentor.welcome", { name: first })}
        description={tp("dashboard.mentor.intro", c.schools_assigned)}
        actions={<><ViewToggle active="operational" /><LinkButton href="/visits/new"><CalendarPlus size={16} aria-hidden /> {t("dashboard.planVisit")}</LinkButton></>}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard href="/visits?status=planned" label={t("dashboard.stat.visitsPlanned")} value={c.visits_planned} icon={CalendarClock} />
        <StatCard href="/visits?status=in_progress" label={t("dashboard.stat.inProgress")} value={c.visits_in_progress} icon={Clock3} tone="amber" />
        <StatCard href="/feedback" label={t("dashboard.stat.feedbackAwaiting")} value={c.feedback_awaiting_approval} icon={MessageSquareText} tone="amber" />
        <StatCard href="/follow-ups?bucket=due_soon" label={t("dashboard.stat.followupsDueSoon")} value={c.followups_due_soon} icon={ListChecks} tone="amber" />
        <StatCard href="/follow-ups?bucket=overdue" label={t("dashboard.stat.followupsOverdue")} value={c.followups_overdue} icon={CircleAlert} tone={c.followups_overdue ? "red" : "neutral"} />
        <StatCard href="/visits?status=completed" label={t("dashboard.stat.visitsCompleted")} value={c.visits_completed} icon={ClipboardCheck} tone="teal" />
      </div>

      <div className="mt-6 grid gap-6 grid-cols-[minmax(0,1fr)] lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title={t("dashboard.agenda.title")} description={t("dashboard.agenda.description")} action={<LinkButton href="/visits" variant="ghost" size="sm">{t("dashboard.agenda.all")}</LinkButton>} />
            {data.upcoming.length === 0 ? (
              <div className="p-5"><EmptyState title={t("dashboard.agenda.emptyTitle")} description={t("dashboard.agenda.emptyDescription")} action={<LinkButton href="/visits/new">{t("dashboard.planVisit")}</LinkButton>} /></div>
            ) : (
              <ul className="divide-y divide-line">
                {data.upcoming.map((v) => (
                  <li key={v.id}>
                    <Link href={`/visits/${v.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-ink-50">
                      <div className="w-16 shrink-0 text-center">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-ink-600">{fmtDay(v.scheduled_at, locale).split(" ")[0]}</p>
                        <p className="text-sm font-semibold">{fmtDay(v.scheduled_at, locale).split(" ").slice(1).join(" ")}</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{v.school_name}</p>
                        <p className="text-[13px] text-ink-600">{t("dashboard.agenda.line", { grade: v.grade, subject: subjectLabel(t, v.subject), teacher: v.teacher_alias, time: fmtTime(v.scheduled_at, locale) })}</p>
                      </div>
                      <VisitStatusChip status={v.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title={t("dashboard.queue.title")} description={t("dashboard.queue.description")} action={<LinkButton href="/follow-ups" variant="ghost" size="sm">{t("dashboard.queue.all")}</LinkButton>} />
            {data.followupQueue.length === 0 ? (
              <div className="p-5"><EmptyState title={t("dashboard.queue.emptyTitle")} description={t("dashboard.queue.emptyDescription")} /></div>
            ) : (
              <ul className="divide-y divide-line">
                {data.followupQueue.map((f) => (
                  <li key={f.id} className="flex items-start gap-3 px-5 py-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium"><span lang={/[ऀ-ॿ]/.test(f.action_text) ? "hi" : undefined}>{f.action_text}</span></p>
                      <p className="mt-0.5 text-[13px] text-ink-600">{t("dashboard.queue.line", { school: f.school_name, teacher: f.teacher_alias, date: fmtDate(f.target_date, locale), relative: relativeDaysT(f.target_date, i) })}</p>
                    </div>
                    <CommitmentChip status={f.display_status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title={t("dashboard.workflow.title")} description={t("dashboard.workflow.description")} />
            <dl className="grid grid-cols-2 gap-px bg-line sm:grid-cols-5">
              {[
                [t("dashboard.workflow.observed"), w.observed], [t("dashboard.workflow.feedbackApproved"), w.feedback_approved], [t("dashboard.workflow.demosApproved"), w.demos_approved],
                [t("dashboard.workflow.commitmentsAgreed"), w.commitments_agreed], [t("dashboard.workflow.commitmentsReviewed"), w.commitments_reviewed],
              ].map(([k, v]) => (
                <div key={k as string} className="bg-card px-4 py-3.5">
                  <dd className="text-2xl font-semibold tracking-tight">{fmtNumber(v as number, locale)}</dd>
                  <dt className="text-[13px] text-ink-600">{k}</dt>
                </div>
              ))}
            </dl>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title={t("dashboard.priorities.title")} description={t("dashboard.priorities.description")} />
            {data.priorities.length === 0 ? (
              <div className="p-5 text-sm text-ink-600">{t("dashboard.priorities.empty")}</div>
            ) : (
              <ul className="divide-y divide-line">
                {data.priorities.map((p) => (
                  <li key={p.schoolId} className="px-5 py-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/schools/${p.schoolId}`} className="font-medium hover:underline">{p.schoolName}</Link>
                      <Chip tone={p.level === "high" ? "red" : p.level === "medium" ? "amber" : "neutral"}>{t(`dashboard.priority.${p.level}`)}</Chip>
                    </div>
                    <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[13px] text-ink-600 marker:text-ink-500">
                      {p.reasonDetails.map((r, k) => <li key={k}>{reasonText(i, r)}</li>)}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
            <p className="border-t border-line px-5 py-2.5 text-xs text-ink-600">{t("dashboard.priorities.footer")} <Link className="underline" href="/settings">{t("dashboard.priorities.seeRules")}</Link></p>
          </Card>

          <Card>
            <CardHeader title={t("dashboard.coverage.title")} description={t("dashboard.coverage.description")} />
            <ul className="space-y-3 px-5 py-4">
              {data.coverage.map((s) => {
                const days = s.days_since;
                const pct = days === null ? 100 : Math.min(100, (days / 90) * 100);
                return (
                  <li key={s.id}>
                    <div className="flex justify-between text-[13px]">
                      <Link href={`/schools/${s.id}`} className="truncate font-medium hover:underline">{s.name}</Link>
                      <span className="shrink-0 text-ink-600">{days === null ? t("dashboard.coverage.never") : t("dashboard.coverage.days", { n: fmtNumber(days, locale) })}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100" role="img" aria-label={days === null ? t("dashboard.coverage.neverAria") : tp("dashboard.coverage.daysAria", days)}>
                      <div className={cn("h-full rounded-full", pct >= 50 ? "bg-amber-600" : "bg-teal-600")} style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card>
            <CardHeader title={t("dashboard.activity.title")} description={t("dashboard.activity.description")} action={<History size={16} className="text-ink-500" aria-hidden />} />
            {data.activity.length === 0 ? (
              <p className="p-5 text-sm text-ink-600">{t("dashboard.activity.empty")}</p>
            ) : (
              <ol className="relative space-y-3 px-5 py-4 before:absolute before:bottom-5 before:left-[25px] before:top-5 before:w-px before:bg-line">
                {data.activity.map((a, k) => (
                  <li key={k} className="relative flex gap-3 text-[13px]">
                    <span className="relative z-10 mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-ink-500 bg-card" aria-hidden />
                    <div>
                      <p className="font-medium">{t(auditKey(a.action))}</p>
                      <p className="text-ink-600">{t("dashboard.activity.when", { date: fmtDate(a.at, locale), time: fmtTime(a.at, locale) })}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>

      <PublicTeaser i={i} />
      <TargetsCard i={i} />
    </>
  );
}

function PublicTeaser({ i }: { i: Translator }) {
  const { t, locale } = i;
  const database = db();
  if (!statesWithData(database).includes("Rajasthan")) return null;
  const snap = stateSnapshot(database, "Rajasthan");
  const facts = snap.facts.filter((f) => ["udise_schools_total", "udise_teachers_total", "udise_ptr"].includes(f.indicator.indicator_id));
  if (facts.length === 0) return null;
  return (
    <Card className="mt-6">
      <CardHeader title={t("dashboard.public.title")} description={t("dashboard.public.description")} action={<PublicDataBadge />} />
      <dl className="grid grid-cols-1 gap-px bg-line sm:grid-cols-3">
        {facts.map((f) => (
          <div key={f.indicator.indicator_id} className="bg-card px-5 py-4">
            <dt className="text-[13px] text-ink-600">{f.indicator.label}</dt>
            <dd>
              <span className="block text-2xl font-semibold tracking-tight">{f.value === null ? t("dashboard.public.notPublished") : fmtNumber(f.value, locale)}</span>
              <SourceCitation cite={{ source_id: f.source_id, reference_period: f.reference_period, geography_level: "state", locator: f.locator }} />
            </dd>
          </div>
        ))}
      </dl>
      <p className="border-t border-line px-5 py-3 text-xs text-ink-600">{t("dashboard.public.footer")} <Link className="underline" href="/public-data">{t("dashboard.public.explore")}</Link></p>
    </Card>
  );
}

function TargetsCard({ i }: { i: Translator }) {
  const { t } = i;
  return (
    <Card className="mt-6">
      <CardHeader
        title={t("dashboard.targets.title")}
        description={t("dashboard.targets.description")}
        action={<Chip tone="amber">{t("dashboard.targets.chip")}</Chip>}
      />
      <div className="relative overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-ink-50 text-[12px] uppercase tracking-wide text-ink-600">
            <tr><th scope="col" className="px-5 py-2.5 font-medium">{t("dashboard.targets.colIndicator")}</th><th scope="col" className="px-5 py-2.5 font-medium">{t("dashboard.targets.colTarget")}</th><th scope="col" className="px-5 py-2.5 font-medium">{t("dashboard.targets.colMeasured")}</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {PILOT_TARGETS.map((pt) => (
              <tr key={pt.id}>
                <td className="px-5 py-2.5">{t(`dashboard.target.${pt.id}.label`)}</td>
                <td className="px-5 py-2.5 text-ink-700">{t(`dashboard.target.${pt.id}.value`)}</td>
                <td className="px-5 py-2.5 text-ink-600">{t("dashboard.targets.notMeasured")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line px-5 py-2.5 text-xs text-ink-600">{t("dashboard.targets.footer")}</p>
    </Card>
  );
}

function SupervisorView({ data, i }: { data: SupervisorDashboard; i: Translator }) {
  const { t } = i;
  const s = data.visitsByStatus;
  return (
    <>
      <PageHeader title={t("dashboard.sup.title")} description={t("dashboard.sup.description")} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard href="/schools" label={t("dashboard.sup.schools")} value={data.schools} icon={ClipboardCheck} />
        <StatCard href="/visits?status=planned" label={t("dashboard.stat.visitsPlanned")} value={(s.planned ?? 0) + (s.draft ?? 0)} icon={CalendarClock} />
        <StatCard href="/visits?status=completed" label={t("dashboard.stat.visitsCompleted")} value={s.completed ?? 0} icon={FileCheck2} tone="teal" />
        <StatCard href="/schools?attention=overdue" label={t("dashboard.sup.overdue")} value={data.overdueFollowups} icon={CircleAlert} tone={data.overdueFollowups ? "red" : "neutral"} />
      </div>
      <Card className="mt-6">
        <CardHeader title={t("dashboard.sup.areasTitle")} description={t("dashboard.sup.areasDescription", { n: MIN_GROUP_SIZE })} />
        <table className="w-full text-left text-sm">
          <thead className="bg-ink-50 text-[12px] uppercase tracking-wide text-ink-600"><tr><th scope="col" className="px-5 py-2.5 font-medium">{t("dashboard.sup.colDomain")}</th><th scope="col" className="px-5 py-2.5 font-medium">{t("dashboard.sup.colTeachers")}</th></tr></thead>
          <tbody className="divide-y divide-line">
            {data.gaps.areas.map((a) => (
              <tr key={a.domain}>
                <td className="px-5 py-3">{a.domain}</td>
                <td className="px-5 py-3">{a.suppressed ? <Chip tone="neutral">{t("dashboard.sup.hidden", { n: data.gaps.minGroupSize })}</Chip> : <strong>{a.teachers}</strong>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-line px-5 py-2.5 text-xs text-ink-600">{t("dashboard.sup.footer")}</p>
      </Card>
    </>
  );
}

function AdminView({ data, i }: { data: AdminDashboard; i: Translator }) {
  const { t } = i;
  return (
    <>
      <PageHeader title={t("dashboard.admin.title")} description={t("dashboard.admin.description")} actions={<LinkButton href="/practice-library">{t("dashboard.admin.open")}</LinkButton>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard href="/practice-library?status=approved" label={t("dashboard.admin.approved")} value={data.cards.approved ?? 0} icon={FileCheck2} tone="teal" />
        <StatCard href="/practice-library?status=draft" label={t("dashboard.admin.awaiting")} value={data.cards.draft ?? 0} icon={Clock3} tone="amber" />
        <StatCard href="/practice-library?status=rejected" label={t("dashboard.admin.rejected")} value={data.cards.rejected ?? 0} icon={CircleAlert} />
      </div>
      <Card className="mt-6">
        <CardHeader title={t("dashboard.admin.awaiting")} />
        {data.pending.length === 0 ? <p className="p-5 text-sm text-ink-600">{t("dashboard.admin.nothingWaiting")}</p> : (
          <ul className="divide-y divide-line">
            {data.pending.map((c) => (
              <li key={c.id}><Link href={`/practice-library/${c.id}`} className="flex items-center justify-between px-5 py-3.5 hover:bg-ink-50"><span><span className="font-mono text-[13px] text-ink-600">{c.id}</span> · {c.title}</span><Chip tone="amber">{t("dashboard.admin.draftChip", { version: c.version })}</Chip></Link></li>
            ))}
          </ul>
        )}
      </Card>
      <Notice className="mt-6" tone="info" title={t("dashboard.admin.noticeTitle")}>{t("dashboard.admin.noticeBody")}</Notice>
    </>
  );
}
