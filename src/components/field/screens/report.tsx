"use client";

import { ArrowLeft, Printer } from "lucide-react";
import { Button, buttonClass, EmptyState, Notice } from "@/components/ui";
import { dayOnly } from "@/components/field/visit/shared";
import { useI18n } from "@/lib/i18n/client";
import { useLive } from "@/lib/offline/field-context";
import { hrefTo } from "@/lib/offline/use-hash-route";
import { buildLocalReport } from "@/lib/offline/report";
import { commitmentStatusKey, fmtDate, fmtDateTime, visitStatusKey } from "@/lib/format";
import { classLabel, purposeLabel } from "@/lib/visit-labels";

export function LocalReportScreen({ visitId }: { visitId: string }) {
  const { t, locale } = useI18n();
  const { data, loading } = useLive(async (s) => {
    const visit = await s.getVisit(visitId);
    if (!visit) return null;
    const [schools, observations, commitments] = await Promise.all([s.listSchools(), s.listObservations(visitId), s.listCommitments(visitId)]);
    const commitment = commitments.find((c) => c.status !== "cancelled") ?? null;
    return { report: buildLocalReport(visit, schools.find((x) => x.id === visit.school_id), observations, commitment), commitmentStatus: commitment?.status };
  }, [visitId]);

  if (loading && !data) return <p role="status" className="p-4 text-ink-600">{t("common.loading")}</p>;
  if (!data) {
    return (
      <EmptyState title={t("field.visit.notFoundTitle")} description={t("field.visit.notFoundBody")}
        action={<a href={hrefTo("/")} className={buttonClass("primary", "lg")}>{t("field.back")}</a>} />
    );
  }
  const { report: r, commitmentStatus } = data;
  const stateText = (s: string) => t(`sync.state.${s}`);

  return (
    <article className="space-y-4" aria-labelledby="rep-title">
      <div className="no-print flex flex-wrap gap-2">
        <a href={hrefTo(`/visit/${visitId}`)} className={buttonClass("secondary", "lg", "gap-2")}><ArrowLeft size={16} aria-hidden /> {t("field.report.backToVisit")}</a>
        <Button size="lg" onClick={() => window.print()} data-testid="report-print"><Printer size={16} aria-hidden /> {t("field.report.print")}</Button>
      </div>

      <Notice tone="warning" title={t("field.report.label")}>{t("field.report.labelNote")}</Notice>

      <header className="space-y-1">
        <h1 id="rep-title" className="text-xl font-semibold tracking-tight text-ink-900">{t("field.report.title")}</h1>
        <p className="text-sm text-ink-700 [overflow-wrap:anywhere]">{r.school?.name ?? t("field.unknownSchool")}{r.school ? ` · ${r.school.district}` : ""}</p>
        <p className="text-sm text-ink-700">{classLabel(t, r.visit.grade, r.visit.subject)} · {fmtDateTime(r.visit.scheduledAt, locale)}</p>
        <p className="text-sm text-ink-700">{t("visits.shell.teacher", { alias: r.visit.teacherAlias })} · {t(visitStatusKey(r.visit.status))}</p>
        <p className="text-sm text-ink-700 [overflow-wrap:anywhere]">{t("visits.detail.purpose")}: {purposeLabel(t, r.visit.purpose)}</p>
        {r.visit.coachingFocus && <p className="text-sm text-ink-700 [overflow-wrap:anywhere]">{t("visits.detail.focus")}: {r.visit.coachingFocus}</p>}
      </header>

      <section aria-labelledby="rep-obs" className="space-y-2">
        <h2 id="rep-obs" className="text-base font-semibold text-ink-900">{t("visits.detail.obsTitle")}</h2>
        {r.observations.length === 0 && <p className="text-sm text-ink-600">{t("visits.detail.obsNone")}</p>}
        <ol className="space-y-3">
          {r.observations.map((o, i) => (
            <li key={o.id} className="break-inside-avoid rounded-lg border border-line p-3 text-sm">
              <p className="text-[13px] text-ink-600">{t("field.report.obsN", { n: i + 1 })}</p>
              <p className="font-medium text-ink-900 [overflow-wrap:anywhere]">{o.practice}</p>
              <p className="[overflow-wrap:anywhere]"><span className="text-ink-600">{t("observe.evidenceLabel")}</span> {o.evidence}</p>
              {o.workedWell && <p className="[overflow-wrap:anywhere]"><span className="text-ink-600">{t("observe.workedWellLabel")}</span> {o.workedWell}</p>}
              {o.improvementArea && <p className="[overflow-wrap:anywhere]"><span className="text-ink-600">{t("observe.areaLabel")}</span> {o.improvementArea}</p>}
              {o.contextNote && <p className="[overflow-wrap:anywhere]"><span className="text-ink-600">{t("observe.contextLabel")}</span> {o.contextNote}</p>}
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="rep-next" className="space-y-2">
        <h2 id="rep-next" className="text-base font-semibold text-ink-900">{t("field.next.title")}</h2>
        {r.nextStep ? (
          <div className="rounded-lg border border-line p-3 text-sm">
            <p className="font-medium text-ink-900 [overflow-wrap:anywhere]">{r.nextStep.action}</p>
            <p>{t("field.next.dueOn", { date: fmtDate(dayOnly(r.nextStep.targetDate), locale) })} · {t(commitmentStatusKey(commitmentStatus ?? r.nextStep.status))}</p>
            <p className="[overflow-wrap:anywhere]"><span className="text-ink-600">{t("field.next.lookFor")}</span> {r.nextStep.expectedEvidence}</p>
          </div>
        ) : (
          <p className="text-sm text-ink-600">{t("field.report.noNext")}</p>
        )}
      </section>

      <section aria-labelledby="rep-state" className="space-y-2">
        <h2 id="rep-state" className="text-base font-semibold text-ink-900">{t("field.report.statesTitle")}</h2>
        <p className="text-sm text-ink-700">{r.unsentCount === 0 ? t("field.report.allSent") : t("field.report.someUnsent")}</p>
        <ul className="space-y-1 text-sm">
          {r.records.map((rec, i) => {
            const n = r.records.slice(0, i).filter((x) => x.kind === "observation").length + 1;
            const label = rec.kind === "visit" ? t("field.report.kindVisit") : rec.kind === "commitment" ? t("field.next.title") : t("field.report.obsN", { n });
            return <li key={`${rec.kind}-${rec.id}`}>{label}: {stateText(rec.state)}</li>;
          })}
        </ul>
      </section>

      <p className="text-sm text-ink-700">{t("field.report.officialNote")}</p>
    </article>
  );
}
