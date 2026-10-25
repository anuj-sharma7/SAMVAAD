import { notFound } from "next/navigation";
import { db, requireActor, safe, aiStatus } from "@/lib/server/context";
import { getVisitDetail, visitProgress } from "@/lib/services/visits";
import { currentFeedbackInternal } from "@/lib/services/feedback";
import { getCurrentDemonstration } from "@/lib/services/demonstrations";
import { VisitHeader } from "@/components/visit-shell";
import { getI18n } from "@/lib/i18n/server";
import { DemoWorkspace } from "./demo-workspace";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("demo.meta.title") };
}

export default async function DemonstratePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor(["mentor"]);
  const r = safe(() => getVisitDetail(db(), actor, id));
  if (!r.ok) notFound();
  const { visit, school } = r.value;
  const progress = visitProgress(db(), visit);
  const fb = currentFeedbackInternal(db(), id);
  const current = getCurrentDemonstration(db(), actor, id);
  const ai = aiStatus();
  const approved = fb?.status === "approved";

  return (
    <>
      <VisitHeader visit={visit} school={school} progress={progress} active="demonstrate" />
      <DemoWorkspace
        visitId={id}
        visitLanguage={visit.language}
        locked={visit.status === "completed"}
        feedbackApproved={approved}
        cards={approved ? fb!.citations.map((c) => ({ id: c.practice_card_id, label: `${c.practice_card_id} · ${c.source_title}` })) : []}
        current={current}
        ai={{ simulated: ai.simulated, label: ai.label, note: ai.note }}
      />
    </>
  );
}
