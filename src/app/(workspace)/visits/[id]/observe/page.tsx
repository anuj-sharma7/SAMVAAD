import { notFound } from "next/navigation";
import { db, requireActor, safe } from "@/lib/server/context";
import { getVisitDetail, visitProgress } from "@/lib/services/visits";
import { listObservations, loadRubric } from "@/lib/services/observations";
import { currentFeedbackInternal } from "@/lib/services/feedback";
import { getI18n } from "@/lib/i18n/server";
import { VisitHeader } from "@/components/visit-shell";
import { getSchoolCheck } from "@/lib/services/school-check";
import { problemCount } from "@/lib/school-check";
import { Card, LinkButton } from "@/components/ui";
import { ObservationManager } from "./observation-manager";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("common.step.observe") };
}

export default async function ObservePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor(["mentor"]);
  const { t } = await getI18n();
  const r = safe(() => getVisitDetail(db(), actor, id));
  if (!r.ok) notFound();
  const { visit, school } = r.value;
  const progress = visitProgress(db(), visit);
  const observations = listObservations(db(), actor, id);
  const fb = currentFeedbackInternal(db(), id);
  const locked = visit.status === "completed" || fb?.status === "approved";
  const lockReason = visit.status === "completed" ? t("observe.lockCompleted") : fb?.status === "approved" ? t("observe.lockApproved") : null;
  const rubric = loadRubric(db()).map((t) => ({ code: t.code, label: t.label, domain: t.domain }));

  const check = getSchoolCheck(db(), actor, id);
  const filled = check.updated_at !== null;
  const n = problemCount(check.answers);
  const checkOpen = visit.status === "in_progress" || visit.status === "pending_review";

  return (
    <>
      <VisitHeader visit={visit} school={school} progress={progress} active="observe" />
      {checkOpen && (
        <Card className="mb-5 flex flex-wrap items-center justify-between gap-3 p-5" data-testid="school-check-card">
          <div className="min-w-0 flex-1 space-y-1">
            <h2 className="text-[15px] font-semibold">{t("check.openCard.title")}</h2>
            <p className="text-[13px] text-ink-600">{t("check.openCard.body")}</p>
            {filled && <p className="text-[13px] font-medium text-teal-700">{n > 0 ? t("check.openCard.done", { n }) : t("check.openCard.doneNone")}</p>}
          </div>
          <LinkButton href={`/visits/${id}/school-check`} variant={filled ? "secondary" : "accent"}>{filled ? t("check.openCard.edit") : t("check.openCard.open")}</LinkButton>
        </Card>
      )}
      <ObservationManager visitId={id} status={visit.status} observations={observations} rubric={rubric} locked={locked} lockReason={lockReason} />
    </>
  );
}
