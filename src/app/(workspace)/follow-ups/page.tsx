import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import { db, requireActor } from "@/lib/server/context";
import { listCommitments } from "@/lib/services/commitments";
import { listVisits } from "@/lib/services/visits";
import { fmtDate, fmtNumber, outcomeKey, relativeDaysT } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { Card, Chip, CommitmentChip, EmptyState, LinkButton, PageHeader, cn } from "@/components/ui";
import { ReviewCommitmentButton } from "@/components/review-commitment";
import { MarkDoneButton } from "./mark-done";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("followups.meta.title") };
}

const BUCKETS = [
  ["all", "followups.bucket.all"], ["overdue", "common.status.commitment.overdue"], ["due_soon", "common.status.commitment.due_soon"], ["open", "followups.bucket.open"], ["completed", "common.status.commitment.completed"], ["reviewed", "common.status.commitment.reviewed"],
] as const;

export default async function FollowUpsPage({ searchParams }: { searchParams: Promise<{ bucket?: string }> }) {
  const actor = await requireActor(["mentor"]);
  const i = await getI18n();
  const { t, locale } = i;
  const sp = await searchParams;
  const bucket = BUCKETS.some(([k]) => k === sp.bucket) ? (sp.bucket as (typeof BUCKETS)[number][0]) : "all";
  const all = listCommitments(db(), actor);
  const items = bucket === "all" ? all : all.filter((c) => c.display_status === bucket);
  const visits = listVisits(db(), actor, { pageSize: 50 }).items;
  const counts = Object.fromEntries(BUCKETS.map(([k]) => [k, k === "all" ? all.length : all.filter((c) => c.display_status === k).length]));

  return (
    <>
      <PageHeader title={t("followups.title")} description={t("followups.description")} />
      <nav aria-label={t("followups.filter.aria")} className="mb-5 flex flex-wrap gap-2">
        {BUCKETS.map(([k, labelKey]) => (
          <Link key={k} href={k === "all" ? "/follow-ups" : `/follow-ups?bucket=${k}`} aria-current={bucket === k ? "page" : undefined}
            className={cn("rounded-full border px-3.5 py-1.5 text-sm", bucket === k ? "border-ink-900 bg-ink-900 text-white" : "border-line-strong bg-card text-ink-700 hover:bg-ink-50")}>
            {t(labelKey)} <span className={bucket === k ? "text-white/80" : "text-ink-500"}>{fmtNumber(counts[k], locale)}</span>
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <EmptyState icon={<CalendarCheck size={28} />} title={t("followups.empty.title")} description={bucket === "all" ? t("followups.empty.all") : t("followups.empty.group")} action={bucket !== "all" ? <LinkButton href="/follow-ups" variant="secondary">{t("followups.empty.showAll")}</LinkButton> : undefined} />
      ) : (
        <ul className="space-y-4">
          {items.map((c) => {
            const eligible = visits.filter((v) => v.school_id === c.school_id && v.id !== c.visit_id && (v.status === "in_progress" || v.status === "pending_review"));
            const nextVisit = visits.filter((v) => v.school_id === c.school_id && ["draft", "planned"].includes(v.status) && new Date(v.scheduled_at) > new Date(c.origin_visit_date)).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0];
            return (
              <li key={c.id}>
                <Card className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="max-w-3xl text-[15px] font-medium" lang={/[ऀ-ॿ]/.test(c.action_text) ? "hi" : undefined}>{c.action_text}</p>
                    <CommitmentChip status={c.display_status} />
                  </div>
                  <dl className="mt-3 grid gap-x-8 gap-y-1.5 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
                    <div><dt className="text-ink-600">{t("followups.field.school")}</dt><dd><Link className="font-medium hover:underline" href={`/schools/${c.school_id}`}>{c.school_name}</Link></dd></div>
                    <div><dt className="text-ink-600">{t("followups.field.teacherOwner")}</dt><dd className="font-medium">{c.teacher_alias} · {t(`followups.owner.${c.owner_role}`)}</dd></div>
                    <div><dt className="text-ink-600">{t("followups.field.lastVisit")}</dt><dd className="font-medium"><Link className="hover:underline" href={`/visits/${c.visit_id}`}>{fmtDate(c.origin_visit_date, locale)}</Link></dd></div>
                    <div><dt className="text-ink-600">{t("followups.field.checkBy")}</dt><dd className="font-medium">{t("followups.dateWithRelative", { date: fmtDate(c.target_date, locale), relative: relativeDaysT(c.target_date, i) })}</dd></div>
                    <div className="sm:col-span-2"><dt className="text-ink-600">{t("followups.field.evidence")}</dt><dd>{c.expected_evidence}</dd></div>
                    <div className="sm:col-span-2"><dt className="text-ink-600">{t("followups.field.nextVisit")}</dt><dd className="font-medium">{nextVisit ? <Link className="hover:underline" href={`/visits/${nextVisit.id}`}>{fmtDate(nextVisit.scheduled_at, locale)}</Link> : <span className="text-ink-600">{t("followups.notScheduled")}<Link className="underline" href={`/visits/new?school=${c.school_id}`}>{t("followups.planOne")}</Link></span>}</dd></div>
                  </dl>
                  {c.status === "reviewed" ? (
                    <div className="mt-4 rounded-lg bg-teal-50 p-3.5 text-sm">
                      <p className="flex flex-wrap items-center gap-2 font-medium text-teal-700"><Chip tone={c.review_outcome === "tried_working" ? "teal" : "amber"}>{t(outcomeKey(c.review_outcome ?? ""))}</Chip> {t("followups.recorded", { date: c.reviewed_at ? fmtDate(c.reviewed_at, locale) : "" })}</p>
                      {c.review_evidence && <p className="mt-1.5"><span className="text-ink-600">{t("followups.reviewEvidence")}</span> {c.review_evidence}</p>}
                      {c.review_barriers && <p className="mt-1"><span className="text-ink-600">{t("followups.reviewBarriers")}</span> {c.review_barriers}</p>}
                    </div>
                  ) : (
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {c.status === "open" && <MarkDoneButton id={c.id} />}
                      <ReviewCommitmentButton commitmentId={c.id} actionText={c.action_text} visits={eligible.map((v) => ({ id: v.id, label: `${fmtDate(v.scheduled_at, locale)} · ${v.school_name}` }))} />
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
