import { db, requireActor } from "@/lib/server/context";
import { getI18n } from "@/lib/i18n/server";
import { getSession, listSessions } from "@/lib/services/mentor-help";
import { helpDefaultsFromQuery } from "@/lib/help/catalog";
import { PageHeader } from "@/components/ui";
import { QuestionRunner } from "./question-runner";

/** Shared server body for the student-questions page and the mid-day-meal/ground page. */
export async function SessionPage({ mode, searchParams }: { mode: "subject" | "place"; searchParams: Promise<{ s?: string | string[]; grade?: string | string[]; subject?: string | string[]; visit?: string | string[] }> }) {
  const actor = await requireActor(["mentor"]);
  const { t } = await getI18n();
  const sp = await searchParams;
  const id = typeof sp.s === "string" ? sp.s : null;
  const d = helpDefaultsFromQuery(sp);
  let initial = null;
  if (id) {
    try {
      const s = getSession(db(), actor, id);
      if ((s.kind === "subject") === (mode === "subject")) initial = s;
    } catch {
      initial = null;
    }
  }
  const recent = listSessions(db(), actor)
    .filter((s) => (s.kind === "subject") === (mode === "subject"))
    .slice(0, 10)
    .map((s) => ({ id: s.id, kind: s.kind, grade: s.grade, subject: s.subject, topic: s.topic, reviewed: !!s.review, created_at: s.created_at }));
  const title = mode === "subject" ? t("mhelp.q.title") : t("mhelp.meal.title");
  return (
    <>
      <PageHeader title={title} description={mode === "subject" ? t("mhelp.q.desc") : t("mhelp.meal.desc")} crumbs={[...(d.visit ? [{ href: `/visits/${d.visit}/observe`, label: t("mhelp.visit.back") }] : []), { href: "/mentor-help", label: t("mhelp.back") }, { label: title }]} />
      <QuestionRunner key={initial?.id ?? "new"} mode={mode} initial={initial} recent={recent} defaults={{ grade: d.grade, subject: d.subject }} keepQuery={d.visit ? `&visit=${d.visit}&grade=${d.grade ?? ""}&subject=${d.subject ?? ""}` : ""} />
    </>
  );
}
