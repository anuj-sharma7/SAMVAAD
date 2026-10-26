"use client";

import { BookOpen, CloudOff, Plus, RefreshCw } from "lucide-react";
import { buttonClass, Card, CardHeader, Chip, EmptyState, Notice, VisitStatusChip } from "@/components/ui";
import { SyncBadge } from "@/components/field/sync-badge";
import { dayOnly, daysFromToday, dueText } from "@/components/field/visit/shared";
import { useI18n } from "@/lib/i18n/client";
import { useField, useLive } from "@/lib/offline/field-context";
import { hrefTo } from "@/lib/offline/use-hash-route";
import { commitmentStatusKey, fmtDate, fmtDateTime } from "@/lib/format";
import { classLabel } from "@/lib/visit-labels";
import type { LocalVisit } from "@/lib/offline/types";

const ACTIVE = new Set(["in_progress", "planned", "draft"]);
const RECENT_LIMIT = 10;

function orderVisits(visits: LocalVisit[]): { active: LocalVisit[]; recent: LocalVisit[] } {
  const active = visits.filter((v) => ACTIVE.has(v.status)).sort((a, b) => (a.status === "in_progress" ? 0 : 1) - (b.status === "in_progress" ? 0 : 1) || a.scheduled_at.localeCompare(b.scheduled_at));
  const recent = visits.filter((v) => !ACTIVE.has(v.status)).sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at)).slice(0, RECENT_LIMIT);
  return { active, recent };
}

export function HomeScreen() {
  const tr = useI18n();
  const { t, locale } = tr;
  const { reach, summary } = useField();
  const { data, loading } = useLive(async (s) => {
    const [visits, schools] = await Promise.all([s.listVisits(), s.listSchools()]);
    const commitments = (await Promise.all(visits.map((v) => s.listCommitments(v.id)))).flat();
    return { visits, schools, commitments };
  });

  const schoolName = (id: string) => data?.schools.find((s) => s.id === id)?.name ?? t("field.unknownSchool");
  const visitOf = (id: string) => data?.visits.find((v) => v.id === id);
  const due = (data?.commitments ?? [])
    .filter((c) => (c.status === "open" || c.status === "completed") && daysFromToday(c.target_date) <= 5)
    .sort((a, b) => a.target_date.localeCompare(b.target_date));
  const { active, recent } = orderVisits(data?.visits ?? []);
  const emptyCache = reach === "offline" && summary !== null && !summary.lastPullAt;

  const visitCard = (v: LocalVisit) => (
    <li key={v.id} data-testid="visit-card">
      <a href={hrefTo(`/visit/${v.id}`)} className="block rounded-lg border border-line bg-card p-3 hover:bg-ink-50">
        <span className="block text-[15px] font-semibold text-ink-900 [overflow-wrap:anywhere]">{schoolName(v.school_id)}</span>
        <span className="mt-0.5 block text-sm text-ink-700">{classLabel(t, v.grade, v.subject)} · {fmtDateTime(v.scheduled_at, locale)}</span>
        <span className="block text-sm text-ink-700">{t("visits.shell.teacher", { alias: v.teacher_alias })}</span>
        <span className="mt-2 flex flex-wrap items-center gap-2">
          <VisitStatusChip status={v.status} />
          <SyncBadge state={v.sync.state} short />
        </span>
      </a>
    </li>
  );

  return (
    <div className="space-y-5">
      <h1 className="sr-only">{t("field.home.title")}</h1>
      <a href={hrefTo("/visits/new")} data-testid="home-start-visit" className={buttonClass("accent", "lg", "w-full gap-2 sm:w-auto")}>
        <Plus size={18} aria-hidden /> {t("field.home.start")}
      </a>

      {emptyCache && (
        <Notice tone="warning" title={t("field.home.noCacheTitle")}>
          <p>{t("field.home.noCache")}</p>
        </Notice>
      )}

      {loading && !data && <p role="status" className="text-ink-600">{t("common.loading")}</p>}

      {data && due.length > 0 && (
        <Card>
          <CardHeader title={t("field.home.nextTitle")} description={t("field.home.nextDesc")} />
          <ul className="space-y-2 px-4 py-4">
            {due.map((c) => {
              const days = daysFromToday(c.target_date);
              const v = visitOf(c.visit_id);
              return (
                <li key={c.id}>
                  <a href={hrefTo(`/visit/${c.visit_id}`)} className="block rounded-lg border border-line p-3 hover:bg-ink-50">
                    <span className="block text-sm font-medium text-ink-900 [overflow-wrap:anywhere]">{c.action_text}</span>
                    <span className="mt-0.5 block text-[13px] text-ink-700">{v ? schoolName(v.school_id) : t("field.unknownSchool")} · {t("visits.shell.teacher", { alias: c.owner_alias })}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-ink-700">
                      <Chip tone={days < 0 ? "red" : "amber"}>{t(commitmentStatusKey(days < 0 ? "overdue" : "due_soon"))}</Chip>
                      <span>{t("field.next.dueOn", { date: fmtDate(dayOnly(c.target_date), locale) })} ({dueText(tr, days)})</span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {data && (
        <Card>
          <CardHeader title={t("visits.title")} />
          <div className="space-y-4 px-4 py-4">
            {active.length === 0 && recent.length === 0 ? (
              <EmptyState icon={<CloudOff size={28} />} title={t("field.home.emptyTitle")} description={t("field.home.emptyBody")}
                action={<a href={hrefTo("/visits/new")} className={buttonClass("primary", "lg")}>{t("field.home.start")}</a>} />
            ) : (
              <>
                {active.length > 0 && (
                  <section aria-labelledby="home-active">
                    <h2 id="home-active" className="mb-2 text-sm font-semibold text-ink-700">{t("field.home.active")}</h2>
                    <ul className="space-y-2">{active.map(visitCard)}</ul>
                  </section>
                )}
                {recent.length > 0 && (
                  <section aria-labelledby="home-recent">
                    <h2 id="home-recent" className="mb-2 text-sm font-semibold text-ink-700">{t("field.home.recent")}</h2>
                    <ul className="space-y-2">{recent.map(visitCard)}</ul>
                  </section>
                )}
              </>
            )}
          </div>
        </Card>
      )}

      <nav aria-label={t("field.home.links")} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <a href={hrefTo("/cards")} className={buttonClass("secondary", "lg", "gap-2")}><BookOpen size={16} aria-hidden /> {t("field.home.cards")}</a>
        <a href={hrefTo("/sync")} className={buttonClass("secondary", "lg", "gap-2")}><RefreshCw size={16} aria-hidden /> {t("field.home.syncCenter")}</a>
        {reach === "online" && <a href="/dashboard" className={buttonClass("ghost", "lg")}>{t("field.home.dashboard")}</a>}
      </nav>
    </div>
  );
}
