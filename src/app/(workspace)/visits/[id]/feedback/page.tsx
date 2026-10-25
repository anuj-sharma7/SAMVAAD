import { notFound } from "next/navigation";
import { db, requireActor, safe, aiStatus } from "@/lib/server/context";
import { getVisitDetail, visitProgress } from "@/lib/services/visits";
import { listObservations } from "@/lib/services/observations";
import { getCurrentFeedback, listFeedbackHistory } from "@/lib/services/feedback";
import { listCards } from "@/lib/services/practice-cards";
import { VisitHeader } from "@/components/visit-shell";
import { getI18n } from "@/lib/i18n/server";
import { FeedbackWorkspace } from "./feedback-workspace";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("feedback.meta.title") };
}

export default async function FeedbackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor(["mentor"]);
  const r = safe(() => getVisitDetail(db(), actor, id));
  if (!r.ok) notFound();
  const { visit, school } = r.value;
  const progress = visitProgress(db(), visit);
  const observations = listObservations(db(), actor, id);
  const current = getCurrentFeedback(db(), actor, id);
  const history = listFeedbackHistory(db(), actor, id).filter((h) => h.id !== current?.id && h.status === "rejected");
  const cards = listCards(db(), actor).map((c) => ({ id: c.id, title: c.title, domain: c.domain, grades: `${c.grade_min}–${c.grade_max}`, subject: c.subject }));
  const ai = aiStatus();

  return (
    <>
      <VisitHeader visit={visit} school={school} progress={progress} active="feedback" />
      <FeedbackWorkspace
        visit={{ id, status: visit.status, language: visit.language, grade: visit.grade, subject: visit.subject }}
        observations={observations.map((o) => ({ id: o.id, practice_observed: o.practice_observed, evidence: o.evidence, tags: o.tags.filter((t) => t.confirmed).map((t) => t.label) }))}
        current={current}
        rejected={history}
        cards={cards}
        ai={{ simulated: ai.simulated, label: ai.label, note: ai.note, mode: ai.mode, configured: ai.configured }}
      />
    </>
  );
}
