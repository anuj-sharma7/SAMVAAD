import Link from "next/link";
import { MessageSquareText } from "lucide-react";
import { db, requireActor } from "@/lib/server/context";
import { visitWorklist, type WorklistRow } from "@/lib/services/worklists";
import { fmtDate } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { subjectLabel } from "@/lib/visit-labels";
import type { Translator } from "@/lib/i18n/translate";
import { Card, CardHeader, Chip, EmptyState, FeedbackChip, LinkButton, PageHeader, SimulatedBadge } from "@/components/ui";


export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("visits.index.feedbackTitle") };
}

function List({ items, cta, i18n }: { items: WorklistRow[]; cta: string; i18n: Translator }) {
  const { t, tp, locale } = i18n;
  return (
    <ul className="divide-y divide-line">
      {items.map((r) => (
        <li key={r.visit_id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <p className="font-medium">{r.school_name}</p>
            <p className="text-[13px] text-ink-600">{fmtDate(r.scheduled_at, locale)} · {t("visits.grade", { grade: r.grade })} {subjectLabel(t, r.subject)} · {r.teacher_alias} · {tp("visits.index.observations", r.observation_count)}</p>
          </div>
          {r.feedback_status && <FeedbackChip status={r.feedback_status} />}
          {r.feedback_simulated ? <SimulatedBadge /> : null}
          <LinkButton size="sm" variant="secondary" href={`/visits/${r.visit_id}/feedback`}>{cta}</LinkButton>
        </li>
      ))}
    </ul>
  );
}

export default async function FeedbackIndex() {
  const actor = await requireActor(["mentor"]);
  const i18n = await getI18n();
  const { t } = i18n;
  const rows = visitWorklist(db(), actor);
  const awaiting = rows.filter((r) => r.feedback_status === "draft" || r.feedback_status === "edited");
  const insufficient = rows.filter((r) => r.feedback_status === "insufficient_evidence");
  const needsDraft = rows.filter((r) => !r.feedback_status && r.visit_status !== "completed");
  const approved = rows.filter((r) => r.feedback_status === "approved");


  return (
    <>
      <PageHeader title={t("visits.index.feedbackTitle")} description={t("visits.index.feedbackDesc")} />
      {rows.length === 0 ? (
        <EmptyState icon={<MessageSquareText size={28} />} title={t("visits.index.feedbackEmptyTitle")} description={t("visits.index.feedbackEmptyDesc")} action={<LinkButton href="/visits">{t("visits.index.goVisits")}</LinkButton>} />
      ) : (
        <div className="space-y-6">
          <Card><CardHeader title={t("visits.index.awaitingTitle")} description={t("visits.index.awaitingDesc")} action={<Chip tone={awaiting.length ? "amber" : "neutral"}>{awaiting.length}</Chip>} />{awaiting.length ? <List items={awaiting} cta={t("visits.index.ctaReview")} i18n={i18n} /> : <p className="p-5 text-sm text-ink-600">{t("visits.index.awaitingNone")}</p>}</Card>
          {insufficient.length > 0 && <Card><CardHeader title={t("visits.index.needsSourceTitle")} description={t("visits.index.needsSourceDesc")} /><List items={insufficient} cta={t("visits.index.ctaOpen")} i18n={i18n} /></Card>}
          <Card><CardHeader title={t("visits.index.readyTitle")} description={t("visits.index.readyDesc")} action={<Chip>{needsDraft.length}</Chip>} />{needsDraft.length ? <List items={needsDraft} cta={t("visits.index.ctaDraft")} i18n={i18n} /> : <p className="p-5 text-sm text-ink-600">{t("visits.index.readyNone")}</p>}</Card>
          <Card><CardHeader title={t("visits.index.approvedTitle")} action={<Chip tone="teal">{approved.length}</Chip>} />{approved.length ? <List items={approved} cta={t("visits.index.ctaView")} i18n={i18n} /> : <p className="p-5 text-sm text-ink-600">{t("visits.index.approvedNone")}</p>}</Card>
        </div>
      )}
      <p className="mt-6 text-xs text-ink-600">{t("visits.index.lookingFor")} <Link className="underline" href="/visits">{t("visits.title")}</Link>.</p>
    </>
  );
}
