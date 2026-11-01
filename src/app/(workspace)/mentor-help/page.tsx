import { AlertCircle, ClipboardList, GraduationCap, UtensilsCrossed } from "lucide-react";
import { db, requireActor } from "@/lib/server/context";
import { getI18n } from "@/lib/i18n/server";
import { listIssues, listSessions } from "@/lib/services/mentor-help";
import { Card, Chip, LinkButton, Notice, PageHeader } from "@/components/ui";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("mhelp.title") };
}

export default async function MentorHelpHub() {
  const actor = await requireActor(["mentor"]);
  const { t } = await getI18n();
  const issues = listIssues(db(), actor).summary;
  const sessions = listSessions(db(), actor);
  const subjectSets = sessions.filter((s) => s.kind === "subject").length;
  const placeSets = sessions.length - subjectSets;
  const cards = [
    { href: "/mentor-help/academic", icon: ClipboardList, title: t("mhelp.hub.academic.title"), desc: t("mhelp.hub.academic.desc"), chip: t("mhelp.hub.openCount", { n: issues.by_status.open + issues.by_status.in_progress }) },
    { href: "/mentor-help/questions", icon: GraduationCap, title: t("mhelp.hub.questions.title"), desc: t("mhelp.hub.questions.desc"), chip: t("mhelp.hub.recent", { n: subjectSets }) },
    { href: "/mentor-help/meal", icon: UtensilsCrossed, title: t("mhelp.hub.meal.title"), desc: t("mhelp.hub.meal.desc"), chip: t("mhelp.hub.recent", { n: placeSets }) },
  ];
  return (
    <>
      <PageHeader title={t("mhelp.title")} description={t("mhelp.desc")} />
      <Notice tone="info" className="mb-6"><span className="inline-flex items-start gap-2"><AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />{t("mhelp.aiNote")}</span></Notice>
      <ul className="grid gap-4 md:grid-cols-3">
        {cards.map((c) => (
          <li key={c.href}>
            <Card className="flex h-full flex-col gap-3 p-5">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><c.icon size={22} aria-hidden /></span>
              <h2 className="text-lg font-semibold">{c.title}</h2>
              <p className="flex-1 text-sm text-ink-600">{c.desc}</p>
              <div className="flex items-center justify-between gap-2">
                <Chip>{c.chip}</Chip>
                <LinkButton href={c.href} variant="accent" size="sm">{t("mhelp.hub.open")}</LinkButton>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
