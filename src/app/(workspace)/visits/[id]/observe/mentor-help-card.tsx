import { ClipboardList, GraduationCap, Sparkles, UtensilsCrossed } from "lucide-react";
import { LinkButton, Card } from "@/components/ui";
import { helpSubjectFor } from "@/lib/help/catalog";

type T = (key: string, params?: Record<string, string | number>) => string;

/** The three Mentor Help AI helpers, opened from a visit with the visit's class, subject and school already filled in. */
export function MentorHelpCard({ t, visitId, schoolId, grade, subject, openProblems }: { t: T; visitId: string; schoolId: string; grade: number; subject: string; openProblems: number }) {
  const hs = helpSubjectFor(subject, grade);
  const q = new URLSearchParams({ visit: visitId, grade: String(grade), subject: hs });
  const items = [
    { icon: ClipboardList, title: t("mhelp.visit.academic"), desc: openProblems > 0 ? t("mhelp.visit.academicOpen", { n: openProblems }) : t("mhelp.visit.academicDesc"), href: `/mentor-help/academic?${new URLSearchParams({ visit: visitId, school: schoolId, grade: String(grade), subject: hs })}`, testid: "mh-academic" },
    { icon: GraduationCap, title: t("mhelp.visit.questions"), desc: t("mhelp.visit.questionsDesc", { grade, subject: t(`mhelp.subject.${hs}`) }), href: `/mentor-help/questions?${q}`, testid: "mh-questions" },
    { icon: UtensilsCrossed, title: t("mhelp.visit.meal"), desc: t("mhelp.visit.mealDesc"), href: `/mentor-help/meal?visit=${visitId}`, testid: "mh-meal" },
  ];
  return (
    <Card className="mb-5 p-5" data-testid="mentor-help-card">
      <div className="mb-3 flex items-start gap-2">
        <Sparkles size={18} className="mt-0.5 shrink-0 text-teal-700" aria-hidden />
        <div>
          <h2 className="text-[15px] font-semibold">{t("mhelp.visit.title")}</h2>
          <p className="text-[13px] text-ink-600">{t("mhelp.visit.body")}</p>
        </div>
      </div>
      <ul className="grid gap-3 md:grid-cols-3">
        {items.map((i) => (
          <li key={i.href} className="flex flex-col gap-2 rounded-lg border border-line p-3.5">
            <p className="flex items-center gap-2 text-sm font-semibold"><i.icon size={16} className="text-teal-700" aria-hidden /> {i.title}</p>
            <p className="flex-1 text-[13px] text-ink-600">{i.desc}</p>
            <LinkButton href={i.href} variant="secondary" size="sm" data-testid={i.testid}>{t("mhelp.hub.open")}</LinkButton>
          </li>
        ))}
      </ul>
    </Card>
  );
}
