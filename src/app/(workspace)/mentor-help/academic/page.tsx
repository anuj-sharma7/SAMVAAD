import { db, requireActor } from "@/lib/server/context";
import { getI18n } from "@/lib/i18n/server";
import { listIssues } from "@/lib/services/mentor-help";
import { helpDefaultsFromQuery } from "@/lib/help/catalog";
import { listSchools } from "@/lib/services/schools";
import { PageHeader } from "@/components/ui";
import { AcademicPanel } from "../academic-panel";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("mhelp.academic.title") };
}

export default async function AcademicPage({ searchParams }: { searchParams: Promise<{ status?: string | string[]; grade?: string | string[]; subject?: string | string[]; school?: string | string[]; visit?: string | string[] }> }) {
  const actor = await requireActor(["mentor"]);
  const { t } = await getI18n();
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : "";
  const d = helpDefaultsFromQuery(sp);
  const { items, summary } = listIssues(db(), actor, { status });
  const schools = listSchools(db(), actor, { pageSize: 50 }).items.map((s) => ({ id: s.id, name: s.name }));
  return (
    <>
      <PageHeader title={t("mhelp.academic.title")} description={t("mhelp.academic.desc")} crumbs={[...(d.visit ? [{ href: `/visits/${d.visit}/observe`, label: t("mhelp.visit.back") }] : []), { href: "/mentor-help", label: t("mhelp.back") }, { label: t("mhelp.academic.title") }]} />
      <AcademicPanel items={items} summary={summary} schools={schools} filter={["open", "in_progress", "resolved"].includes(status) ? status : ""} defaults={{ school: d.school, grade: d.grade, subject: d.subject }} />
    </>
  );
}
