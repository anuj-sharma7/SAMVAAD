import { db, requireActor } from "@/lib/server/context";
import { listSchools } from "@/lib/services/schools";
import { listCommitments } from "@/lib/services/commitments";
import { getI18n } from "@/lib/i18n/server";
import { PageHeader, Notice } from "@/components/ui";
import { VisitForm } from "./visit-form";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("visits.list.plan") };
}

export default async function NewVisitPage({ searchParams }: { searchParams: Promise<{ school?: string }> }) {
  const actor = await requireActor(["mentor"]);
  const { t } = await getI18n();
  const { school } = await searchParams;
  const schools = listSchools(db(), actor, { pageSize: 50 }).items.map((s) => ({ id: s.id, name: s.name, code: s.code }));
  const pending = listCommitments(db(), actor)
    .filter((c) => c.status === "open" || c.status === "completed")
    .map((c) => ({ id: c.id, school_id: c.school_id, teacher_alias: c.teacher_alias, action_text: c.action_text, target_date: c.target_date, display_status: c.display_status }));

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/visits", label: t("visits.title") }, { label: t("visits.list.plan") }]}
        title={t("visits.list.plan")}
        description={t("visits.new.desc")}
      />
      <div className="mx-auto max-w-3xl">
        <VisitForm schools={schools} pending={pending} defaultSchool={school && schools.some((s) => s.id === school) ? school : undefined} defaultLanguage={actor.preferredLanguage} />
        <Notice className="mt-6" tone="info" title={t("visits.new.audioOffTitle")}>
          {t("visits.new.audioOffBody")}
        </Notice>
      </div>
    </>
  );
}
