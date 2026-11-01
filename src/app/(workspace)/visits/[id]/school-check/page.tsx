import { notFound } from "next/navigation";
import { db, requireActor, safe } from "@/lib/server/context";
import { getVisitDetail, visitProgress } from "@/lib/services/visits";
import { getSchoolCheck } from "@/lib/services/school-check";
import { getI18n } from "@/lib/i18n/server";
import { Card, CardHeader, LinkButton, Notice } from "@/components/ui";
import { VisitHeader } from "@/components/visit-shell";
import { SchoolCheckForm } from "./school-check-form";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("check.title") };
}

export default async function SchoolCheckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor(["mentor"]);
  const { t } = await getI18n();
  const r = safe(() => getVisitDetail(db(), actor, id));
  if (!r.ok) notFound();
  const { visit, school } = r.value;
  const progress = visitProgress(db(), visit);
  const check = getSchoolCheck(db(), actor, id);
  const open = visit.status === "in_progress" || visit.status === "pending_review";

  return (
    <>
      <VisitHeader visit={visit} school={school} progress={progress} active="observe" />
      <div className="mx-auto max-w-2xl space-y-4">
        <Card>
          <CardHeader title={t("check.title")} />
          {open ? (
            <SchoolCheckForm visitId={id} initial={check.answers} />
          ) : (
            <div className="p-5"><Notice tone="info">{visit.status === "completed" ? t("check.locked") : t("check.notStarted")}</Notice></div>
          )}
        </Card>
        <LinkButton href={`/visits/${id}/observe`} variant="secondary">{t("check.back")}</LinkButton>
      </div>
    </>
  );
}
