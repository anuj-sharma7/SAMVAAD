import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn, PageHeader, VisitStatusChip } from "./ui";
import { fmtDate, fmtTime } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { classLabel } from "@/lib/visit-labels";
import type { SchoolRow, VisitRow } from "@/lib/types";

const TABS = [
  { key: "overview", labelKey: "visits.shell.overview", href: (id: string) => `/visits/${id}` },
  { key: "observe", labelKey: "common.step.observe", href: (id: string) => `/visits/${id}/observe` },
  { key: "feedback", labelKey: "visits.shell.coach", href: (id: string) => `/visits/${id}/feedback` },
  { key: "demonstrate", labelKey: "common.step.demonstrate", href: (id: string) => `/visits/${id}/demonstrate` },
  { key: "report", labelKey: "visits.shell.report", href: (id: string) => `/visits/${id}/report` },
] as const;

export type VisitTab = (typeof TABS)[number]["key"];

const STEPS = [
  { key: "plan", labelKey: "common.step.plan", href: (id: string) => `/visits/${id}` },
  { key: "observe", labelKey: "common.step.observe", href: (id: string) => `/visits/${id}/observe` },
  { key: "coach", labelKey: "common.step.coach", href: (id: string) => `/visits/${id}/feedback` },
  { key: "demonstrate", labelKey: "common.step.demonstrate", href: (id: string) => `/visits/${id}/demonstrate` },
  { key: "follow_up", labelKey: "common.step.followup", href: (id: string) => `/visits/${id}/report` },
] as const;

/** Shared header for every visit page: breadcrumbs, key facts, the five-stage progress indicator and tabs. */
export async function VisitHeader({
  visit, school, progress, active, title, description, actions,
}: {
  visit: VisitRow;
  school: Pick<SchoolRow, "id" | "name">;
  progress: { done: Record<string, boolean>; current: string };
  active: VisitTab;
  title?: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const { t, locale } = await getI18n();
  const tab = TABS.find((x) => x.key === active)!;
  const nextKey = progress.current === "plan" && visit.status === "draft" ? "visits.shell.next.planDraft" : `visits.shell.next.${progress.current}`;
  const showNext = visit.status !== "completed" && !(progress.done.follow_up && progress.done.coach);
  return (
    <>
      <PageHeader
        crumbs={[{ href: "/visits", label: t("visits.title") }, { href: `/visits/${visit.id}`, label: school.name }, ...(active !== "overview" ? [{ label: t(tab.labelKey) }] : [])]}
        title={title ?? school.name}
        description={
          description ?? (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>{fmtDate(visit.scheduled_at, locale)}, {fmtTime(visit.scheduled_at, locale)}</span>
              <span>{classLabel(t, visit.grade, visit.subject)}</span>
              <span>{t("visits.shell.teacher", { alias: visit.teacher_alias })}</span>
              <VisitStatusChip status={visit.status} />
            </span>
          )
        }
        actions={actions}
      />
      <div className="mb-4">
        <ol className="grid grid-cols-5 gap-1.5" aria-label={t("visits.shell.stepperLabel")}>
          {STEPS.map((s, i) => {
            const isDone = !!progress.done[s.key];
            const isCurrent = !isDone && progress.current === s.key;
            const label = t(s.labelKey);
            return (
              <li key={s.key} aria-current={isCurrent ? "step" : undefined}>
                <Link
                  href={s.href(visit.id)}
                  className={cn("flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2 hover:bg-card sm:flex-row sm:gap-2 sm:px-3", isCurrent ? "border-ink-900 bg-card" : "border-line bg-card/60")}
                >
                  {/* The link needs its own accessible name: the visible label is hidden on phones and from assistive tech. */}
                  <span className="sr-only">{label}: {isDone ? t("visits.shell.stepDone") : isCurrent ? t("visits.shell.stepCurrent") : t("visits.shell.stepTodo")}</span>
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                      isDone ? "border-teal-700 bg-teal-700 text-white" : isCurrent ? "border-ink-900 bg-ink-900 text-white" : "border-line-strong bg-card text-ink-500",
                    )}
                    aria-hidden
                  >
                    {isDone ? "✓" : i + 1}
                  </span>
                  <span className={cn("hidden text-[13px] sm:inline", isCurrent || isDone ? "font-semibold text-ink-900" : "text-ink-600", isCurrent && "underline decoration-2 underline-offset-4")} aria-hidden>{label}</span>
                </Link>
              </li>
            );
          })}
        </ol>
        {showNext && (
          <p className="mt-2.5 flex items-center gap-2 rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-800">
            <ArrowRight size={15} className="shrink-0" aria-hidden />
            <span><span className="font-semibold">{t("visits.shell.nextLabel")}</span> {t(nextKey)}</span>
          </p>
        )}
      </div>
      <nav aria-label={t("visits.shell.tabsLabel")} className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((x) => (
          <Link
            key={x.key}
            href={x.href(visit.id)}
            aria-current={x.key === active ? "page" : undefined}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium",
              x.key === active ? "border-ink-900 text-ink-900" : "border-transparent text-ink-600 hover:text-ink-900",
            )}
          >
            {t(x.labelKey)}
          </Link>
        ))}
      </nav>
    </>
  );
}
