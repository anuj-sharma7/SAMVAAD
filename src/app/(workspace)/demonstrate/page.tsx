import { Presentation } from "lucide-react";
import { db, requireActor } from "@/lib/server/context";
import { visitWorklist } from "@/lib/services/worklists";
import { fmtDate } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { subjectLabel } from "@/lib/visit-labels";
import { Card, CardHeader, Chip, EmptyState, LinkButton, PageHeader } from "@/components/ui";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("visits.index.demoTitle") };
}

export default async function DemonstrateIndex() {
  const actor = await requireActor(["mentor"]);
  const { t, locale } = await getI18n();
  const rows = visitWorklist(db(), actor).filter((r) => r.feedback_status === "approved");
  return (
    <>
      <PageHeader title={t("visits.index.demoTitle")} description={t("visits.index.demoDesc")} />
      {rows.length === 0 ? (
        <EmptyState icon={<Presentation size={28} />} title={t("visits.index.demoEmptyTitle")} description={t("visits.index.demoEmptyDesc")} action={<LinkButton href="/feedback">{t("visits.index.goFeedback")}</LinkButton>} />
      ) : (
        <Card>
          <CardHeader title={t("visits.index.demoListTitle")} />
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.visit_id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{r.school_name}</p>
                  <p className="text-[13px] text-ink-600">{fmtDate(r.scheduled_at, locale)} · {t("visits.grade", { grade: r.grade })} {subjectLabel(t, r.subject)} · {r.teacher_alias}</p>
                </div>
                {r.demo_status === "approved" ? <Chip tone="teal">{t("visits.index.scriptApproved")}</Chip> : r.demo_status ? <Chip tone="amber">{t("visits.index.scriptReview")}</Chip> : <Chip>{t("visits.index.scriptNone")}</Chip>}
                <LinkButton size="sm" variant="secondary" href={`/visits/${r.visit_id}/demonstrate`}>{r.demo_status ? t("visits.index.openScript") : t("visits.index.prepareScript")}</LinkButton>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
