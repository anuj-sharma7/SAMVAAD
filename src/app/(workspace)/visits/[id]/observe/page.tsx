import { notFound } from "next/navigation";
import { db, requireActor, safe } from "@/lib/server/context";
import { getVisitDetail, visitProgress } from "@/lib/services/visits";
import { listObservations, loadRubric } from "@/lib/services/observations";
import { currentFeedbackInternal } from "@/lib/services/feedback";
import { getI18n } from "@/lib/i18n/server";
import { VisitHeader } from "@/components/visit-shell";
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

  return (
    <>
      <VisitHeader visit={visit} school={school} progress={progress} active="observe" />
      <ObservationManager visitId={id} status={visit.status} observations={observations} rubric={rubric} locked={locked} lockReason={lockReason} />
    </>
  );
}
