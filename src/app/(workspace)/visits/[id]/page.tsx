import Link from "next/link";
import { notFound } from "next/navigation";
import { db, requireActor, safe } from "@/lib/server/context";
import { getVisitDetail, visitProgress } from "@/lib/services/visits";
import { listObservations } from "@/lib/services/observations";
import { currentFeedbackInternal } from "@/lib/services/feedback";
import { listCommitments } from "@/lib/services/commitments";
import { fmtDate, outcomeKey, relativeDaysT } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { purposeLabel } from "@/lib/visit-labels";
import { Card, CardHeader, Chip, CommitmentChip, DefinitionRow, FeedbackChip, LinkButton, Notice, SimulatedBadge } from "@/components/ui";
import { VisitHeader } from "@/components/visit-shell";
import { ReviewCommitmentButton } from "@/components/review-commitment";
import { VisitActions } from "./visit-actions";

export default async function VisitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor(["mentor"]);
  const i18n = await getI18n();
  const { t, locale } = i18n;
  const r = safe(() => getVisitDetail(db(), actor, id));
  if (!r.ok) notFound();
  const { visit, school, previousCommitment } = r.value;
  const progress = visitProgress(db(), visit);
  const observations = listObservations(db(), actor, id);
  const feedback = currentFeedbackInternal(db(), id);
  const commitments = listCommitments(db(), actor, { visit_id: id });
  const reviewed = listCommitments(db(), actor).filter((c) => c.review_visit_id === id);
  const canReview = visit.status === "in_progress" || visit.status === "pending_review";

  return (
    <>
      <VisitHeader visit={visit} school={school} progress={progress} active="overview" actions={<VisitActions visitId={id} status={visit.status} observationCount={observations.length} />} />

      <div className="grid gap-6 grid-cols-[minmax(0,1fr)] lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          {previousCommitment && (
            <Card className="border-amber-100">
              <CardHeader title={t("visits.detail.followTitle")} description={t("visits.detail.followDesc")} action={<CommitmentChip status={previousCommitment.status === "open" ? (new Date(previousCommitment.target_date) < new Date() ? "overdue" : "open") : previousCommitment.status} />} />
              <div className="space-y-3 p-5">
                <p className="text-[15px] font-medium" lang={/[ऀ-ॿ]/.test(previousCommitment.action_text) ? "hi" : undefined}>{previousCommitment.action_text}</p>
                <p className="text-[13px] text-ink-600">{t("visits.detail.followMeta", { date: fmtDate(previousCommitment.target_date, locale), rel: relativeDaysT(previousCommitment.target_date, i18n), evidence: previousCommitment.expected_evidence })}</p>
                {previousCommitment.status === "reviewed" ? (
                  <Notice tone="success" title={t("visits.detail.reviewedTitle")}>{previousCommitment.review_outcome ? t(outcomeKey(previousCommitment.review_outcome)) : t("visits.detail.reviewedTitle")}</Notice>
                ) : canReview ? (
                  <ReviewCommitmentButton commitmentId={previousCommitment.id} actionText={previousCommitment.action_text} visits={[{ id, label: t("visits.detail.thisVisit", { date: fmtDate(visit.scheduled_at, locale) }) }]} label={t("visits.detail.recordWhat")} />
                ) : (
                  <p className="text-[13px] text-ink-600">{t("visits.detail.startToRecord")}</p>
                )}
              </div>
            </Card>
          )}
          {reviewed.length > 0 && (
            <Card>
              <CardHeader title={t("visits.detail.recordedTitle")} />
              <ul className="divide-y divide-line">
                {reviewed.map((c) => (
                  <li key={c.id} className="space-y-1 px-5 py-3.5 text-sm">
                    <p className="font-medium" lang={/[ऀ-ॿ]/.test(c.action_text) ? "hi" : undefined}>{c.action_text}</p>
                    <p><Chip tone={c.review_outcome === "tried_working" ? "teal" : "amber"}>{c.review_outcome ? t(outcomeKey(c.review_outcome)) : ""}</Chip></p>
                    {c.review_evidence && <p className="text-ink-700"><span className="text-ink-600">{t("visits.detail.evidence")}</span> {c.review_evidence}</p>}
                    {c.review_barriers && <p className="text-ink-700"><span className="text-ink-600">{t("visits.detail.barriers")}</span> {c.review_barriers}</p>}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <CardHeader title={t("visits.detail.obsTitle")} description={t("visits.detail.obsDesc")} action={<LinkButton size="sm" variant="secondary" href={`/visits/${id}/observe`}>{observations.length ? t("visits.detail.openObs") : t("visits.detail.startObs")}</LinkButton>} />
            {observations.length === 0 ? (
              <p className="p-5 text-sm text-ink-600">{visit.status === "planned" || visit.status === "draft" ? t("visits.detail.obsStartFirst") : t("visits.detail.obsNone")}</p>
            ) : (
              <ul className="divide-y divide-line">
                {observations.map((o) => (
                  <li key={o.id} className="space-y-1.5 px-5 py-4 text-sm">
                    <p className="font-medium">{o.practice_observed}</p>
                    <p className="text-ink-700">{o.evidence}</p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {o.tags.filter((g) => g.confirmed).map((g) => <Chip key={g.code} tone="teal">{g.label}</Chip>)}
                      {o.tags.filter((g) => !g.confirmed).map((g) => <Chip key={g.code} tone="neutral" title={t("visits.detail.suggestedTagTitle")}>{t("visits.detail.suggestedTag", { label: g.label })}</Chip>)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title={t("visits.detail.fbTitle")} action={feedback ? <FeedbackChip status={feedback.status} /> : undefined} />
            {!feedback ? (
              <p className="p-5 text-sm text-ink-600">{t("visits.detail.fbNone")}</p>
            ) : feedback.status === "insufficient_evidence" ? (
              <div className="p-5"><Notice tone="warning" title={t("visits.detail.fbInsufficientTitle")}>{t("visits.detail.fbInsufficientBody")}</Notice></div>
            ) : (
              <div className="space-y-3 p-5 text-sm">
                {feedback.is_simulated && <SimulatedBadge />}
                <p><span className="font-semibold text-teal-700">{t("visits.detail.strength")}</span> <span lang={feedback.language}>{feedback.strength}</span></p>
                <p><span className="font-semibold text-amber-800">{t("visits.detail.priority")}</span> <span lang={feedback.language}>{feedback.priority_practice}</span></p>
                <p><span className="font-semibold text-ink-900">{t("visits.detail.nextStep")}</span> <span lang={feedback.language}>{feedback.next_step}</span></p>
                <p className="text-[13px] text-ink-600">{t("visits.detail.source", { sources: feedback.citations.map((c) => `${c.practice_card_id} · ${c.source_title}`).join("; ") })}</p>
                <LinkButton size="sm" variant="secondary" href={`/visits/${id}/feedback`}>{t("visits.detail.openFeedback")}</LinkButton>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title={t("visits.detail.detailsTitle")} />
            <dl className="divide-y divide-line px-5">
              <DefinitionRow label={t("visits.detail.school")}><Link className="hover:underline" href={`/schools/${school.id}`}>{school.name}</Link></DefinitionRow>
              <DefinitionRow label={t("visits.detail.purpose")}>{purposeLabel(t, visit.purpose)}</DefinitionRow>
              <DefinitionRow label={t("visits.detail.focus")}>{visit.coaching_focus ?? "—"}</DefinitionRow>
              <DefinitionRow label={t("visits.detail.language")}>{visit.language === "hi" ? t("visits.detail.langHi") : t("visits.detail.langEn")}</DefinitionRow>
              <DefinitionRow label={t("visits.detail.method")}>{visit.observation_method === "text" ? t("visits.new.methodText") : t("visits.new.methodChecklist")}</DefinitionRow>
              <DefinitionRow label={t("visits.detail.audio")}><Chip>{t("visits.detail.audioOff")}</Chip></DefinitionRow>
              <DefinitionRow label={t("visits.detail.prepLabel")}>{visit.prep_notes ?? "—"}</DefinitionRow>
            </dl>
          </Card>

          <Card>
            <CardHeader title={t("visits.detail.commitTitle")} description={t("visits.detail.commitDesc")} />
            {commitments.length === 0 ? (
              <p className="p-5 text-sm text-ink-600">{t("visits.detail.commitNone")}</p>
            ) : (
              commitments.map((c) => (
                <div key={c.id} className="space-y-1.5 p-5 text-sm">
                  <p className="font-medium" lang={/[ऀ-ॿ]/.test(c.action_text) ? "hi" : undefined}>{c.action_text}</p>
                  <p className="text-ink-600">{t("visits.detail.commitDue", { date: fmtDate(c.target_date, locale), rel: relativeDaysT(c.target_date, i18n) })}</p>
                  <CommitmentChip status={c.display_status} />
                </div>
              ))
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
