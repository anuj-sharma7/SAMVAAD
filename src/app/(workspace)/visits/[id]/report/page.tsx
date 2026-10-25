import { notFound } from "next/navigation";
import { db, requireActor, safe } from "@/lib/server/context";
import { getVisitDetail, visitProgress } from "@/lib/services/visits";
import { currentFeedbackInternal } from "@/lib/services/feedback";
import { listCommitments, suggestCommitment } from "@/lib/services/commitments";
import { getReport } from "@/lib/services/reports";
import { get } from "@/lib/db/client";
import { VisitHeader } from "@/components/visit-shell";
import { getI18n } from "@/lib/i18n/server";
import { FollowUpPanel } from "./follow-up-panel";
import { ReportPanel } from "./report-panel";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("report.meta.title") };
}

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor(["mentor"]);
  const r = safe(() => getVisitDetail(db(), actor, id));
  if (!r.ok) notFound();
  const { visit, school } = r.value;
  const progress = visitProgress(db(), visit);
  const fb = currentFeedbackInternal(db(), id);
  const approved = fb?.status === "approved";
  const commitments = listCommitments(db(), actor, { visit_id: id });
  const suggestion = approved && commitments.length === 0 ? safe(() => suggestCommitment(db(), actor, id)) : null;
  const report = getReport(db(), actor, id);
  const reviewer = report?.reviewed_by ? get<{ display_name: string }>(db(), "SELECT display_name FROM profiles WHERE id = ?", report.reviewed_by)?.display_name ?? null : null;

  return (
    <>
      <div className="no-print">
        <VisitHeader visit={visit} school={school} progress={progress} active="report" />
      </div>
      <div className="space-y-8">
        <div className="no-print">
          <FollowUpPanel
            visitId={id}
            locked={visit.status === "completed"}
            feedbackApproved={approved}
            commitment={commitments[0] ?? null}
            suggestion={suggestion && suggestion.ok ? suggestion.value : null}
          />
        </div>
        <ReportPanel
          visitId={id}
          visitStatus={visit.status}
          report={report}
          reviewer={reviewer}
          ready={{ feedback: approved, commitment: commitments.length > 0 }}
        />
      </div>
    </>
  );
}
