"use client";

import { useRef, useState } from "react";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { Button, buttonClass, Card, CardHeader, CommitmentChip, EmptyState, Notice, VisitStatusChip } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm";
import { SyncBadge } from "@/components/field/sync-badge";
import { CommitmentForm } from "@/components/field/visit/commitment-form";
import { ObservationForm } from "@/components/field/visit/observation-form";
import { describeFailure, dayOnly, FailureNotice, SavedSlot, SyncProblem, type Failure } from "@/components/field/visit/shared";
import { useI18n } from "@/lib/i18n/client";
import { useField, useLive } from "@/lib/offline/field-context";
import { hrefTo, useHashRoute } from "@/lib/offline/use-hash-route";
import { fmtDate, fmtDateTime, visitStatusKey } from "@/lib/format";
import { classLabel, purposeLabel } from "@/lib/visit-labels";
import type { LocalObservation } from "@/lib/offline/types";

type Where = "visit" | "obs" | "next";

export function VisitScreen({ visitId }: { visitId: string }) {
  const { t, locale } = useI18n();
  const { store, reach } = useField();
  const { path } = useHashRoute();
  const { data, loading } = useLive(async (s) => {
    const visit = await s.getVisit(visitId);
    if (!visit) return null;
    const [schools, observations, commitments, open] = await Promise.all([
      s.listSchools(), s.listObservations(visitId), s.listCommitments(visitId), s.openCommitmentsFor(visit.school_id, visit.teacher_alias),
    ]);
    return { visit, school: schools.find((x) => x.id === visit.school_id), observations, commitments, earlier: open.filter((c) => c.visit_id !== visit.id) };
  }, [visitId]);

  const [saved, setSaved] = useState<{ at: Date; where: Where } | null>(null);
  const [failure, setFailure] = useState<{ where: Where; f: Failure } | null>(null);
  const [editingObs, setEditingObs] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [editingNext, setEditingNext] = useState(false);
  const [working, setWorking] = useState(false);
  const busy = useRef(false);

  if (loading && !data) return <p role="status" className="p-4 text-ink-600">{t("common.loading")}</p>;
  if (!data) {
    return (
      <EmptyState title={t("field.visit.notFoundTitle")} description={t("field.visit.notFoundBody")}
        action={<a href={hrefTo("/")} className={buttonClass("primary", "lg")}>{t("field.back")}</a>} />
    );
  }
  const { visit, school, observations, commitments, earlier } = data;
  const commitment = commitments.find((c) => c.status !== "cancelled");
  const status = visit.status;
  const canObserve = status === "in_progress";
  const canEditObs = status === "in_progress" || status === "pending_review";
  const justCreated = path.includes("new=1");
  const note = saved ?? (justCreated ? { at: new Date(visit.sync.localUpdatedAt), where: "visit" as Where } : null);
  const noteFor = (w: Where) => (note?.where === w ? note.at : null);
  const failFor = (w: Where) => (failure?.where === w ? failure.f : null);
  const markSaved = (where: Where) => { setFailure(null); setSaved({ at: new Date(), where }); };

  async function guarded(where: Where, work: () => Promise<void>) {
    if (busy.current || !store) return;
    busy.current = true;
    setWorking(true);
    setFailure(null);
    try {
      await work();
      markSaved(where);
    } catch (err) {
      setFailure({ where, f: describeFailure(t, err) });
    } finally {
      busy.current = false;
      setWorking(false);
    }
  }
  const transition = (to: "in_progress" | "pending_review") => guarded("visit", async () => { await store!.transitionVisit(visit.id, to); });
  const remove = (o: LocalObservation) => guarded("obs", async () => { await store!.deleteObservation(o.id); setConfirmDel(null); });

  const syncedAll = visit.sync.state === "synced" && observations.every((o) => o.sync.state === "synced") && commitments.every((c) => c.sync.state === "synced");
  const aiReady = reach === "online" && syncedAll;
  const aiReason = reach !== "online" ? t("field.ai.needsInternet") : visit.sync.state !== "synced" ? t("field.ai.needsSyncVisit") : t("field.ai.needsSyncRecords");

  return (
    <div className="space-y-4">
      <a href={hrefTo("/")} className="no-print inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink-700 underline">
        <ArrowLeft size={16} aria-hidden /> {t("field.back")}
      </a>

      <Card>
        <div className="space-y-3 px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <VisitStatusChip status={status} />
            <span data-testid="visit-sync-badge"><SyncBadge state={visit.sync.state} /></span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-ink-900 [overflow-wrap:anywhere]">{school?.name ?? t("field.unknownSchool")}</h1>
          <p className="text-sm text-ink-700">{classLabel(t, visit.grade, visit.subject)} · {fmtDateTime(visit.scheduled_at, locale)}</p>
          <p className="text-sm text-ink-700">{t("visits.shell.teacher", { alias: visit.teacher_alias })}</p>
          <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-ink-600">{t("visits.detail.purpose")}</dt>
            <dd className="[overflow-wrap:anywhere]">{purposeLabel(t, visit.purpose)}</dd>
            {visit.coaching_focus && (<><dt className="text-ink-600">{t("visits.detail.focus")}</dt><dd className="[overflow-wrap:anywhere]">{visit.coaching_focus}</dd></>)}
            {visit.prep_notes && (<><dt className="text-ink-600">{t("visits.detail.prepLabel")}</dt><dd className="[overflow-wrap:anywhere]">{visit.prep_notes}</dd></>)}
          </dl>
        </div>
      </Card>

      <SyncProblem sync={visit.sync} />

      {earlier.length > 0 && (
        <Notice tone="info" title={t("field.followUp.title")}>
          <p className="[overflow-wrap:anywhere]">{earlier[0].action_text}</p>
          <p className="mt-1 text-[13px]">{t("field.followUp.meta", { date: fmtDate(dayOnly(earlier[0].target_date), locale), evidence: earlier[0].expected_evidence })}</p>
        </Notice>
      )}

      <Card>
        <CardHeader title={t("field.visit.actionsTitle")} />
        <div className="space-y-3 px-4 py-4">
          {(status === "planned" || status === "draft") && (
            <>
              <p className="text-sm text-ink-700">{t("visits.shell.next.plan")}</p>
              <Button size="lg" disabled={working} onClick={() => transition("in_progress")} data-testid="visit-start">{t("visits.actions.start")}</Button>
            </>
          )}
          {status === "in_progress" && (
            <>
              <p className="text-sm text-ink-700">{t("visits.shell.next.observe")}</p>
              <span data-testid="visit-finish" className="inline-flex">
                <ConfirmButton variant="accent" size="lg" label={t("field.visit.finish")} title={t("field.visit.finishTitle")}
                  description={t("field.visit.finishDesc")} confirmLabel={t("field.visit.finish")} disabled={working || observations.length === 0}
                  onConfirm={() => transition("pending_review")} />
              </span>
              {observations.length === 0 && <p className="text-[13px] text-ink-600">{t("observe.nextNone")}</p>}
            </>
          )}
          {status === "pending_review" && (
            <>
              <p className="text-sm text-ink-700">{t("field.visit.finished")}</p>
              <Button size="lg" variant="secondary" disabled={working} onClick={() => transition("in_progress")}>{t("visits.actions.reopen")}</Button>
            </>
          )}
          {status === "completed" && <Notice tone="info">{t("observe.lockCompleted")}</Notice>}
          <SavedSlot at={noteFor("visit")} />
          <FailureNotice failure={failFor("visit")} />
        </div>
      </Card>

      <Card>
        <CardHeader title={t("visits.detail.obsTitle")} description={t("visits.detail.obsDesc")} />
        <div className="space-y-4 px-4 py-4">
          {observations.length === 0 && <p className="text-sm text-ink-600">{t("visits.detail.obsNone")}</p>}
          <ul className="space-y-3">
            {observations.map((o) => (
              <li key={o.id} data-testid="obs-item" className="rounded-lg border border-line p-3">
                {editingObs === o.id ? (
                  <ObservationForm visitId={visit.id} initial={o} onCancel={() => setEditingObs(null)} onSaved={() => { setEditingObs(null); markSaved("obs"); }} />
                ) : (
                  <div className="space-y-2 text-sm">
                    <SyncBadge state={o.sync.state} short />
                    <p className="font-medium text-ink-900 [overflow-wrap:anywhere]">{o.practice_observed}</p>
                    <p className="[overflow-wrap:anywhere]"><span className="text-ink-600">{t("observe.evidenceLabel")}</span> {o.evidence}</p>
                    {o.worked_well && <p className="[overflow-wrap:anywhere]"><span className="text-ink-600">{t("observe.workedWellLabel")}</span> {o.worked_well}</p>}
                    {o.improvement_area && <p className="[overflow-wrap:anywhere]"><span className="text-ink-600">{t("observe.areaLabel")}</span> {o.improvement_area}</p>}
                    {o.context_note && <p className="[overflow-wrap:anywhere]"><span className="text-ink-600">{t("observe.contextLabel")}</span> {o.context_note}</p>}
                    <SyncProblem sync={o.sync} />
                    {canEditObs && (
                      confirmDel === o.id ? (
                        <div role="group" aria-label={t("observe.deleteTitle")} className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
                          <p className="font-medium text-red-900">{t("observe.deleteTitle")}</p>
                          <p className="text-red-900">{t("field.obs.deleteDesc")}</p>
                          <div className="flex flex-wrap gap-2">
                            <Button size="lg" variant="danger" disabled={working} onClick={() => remove(o)}>{t("common.delete")}</Button>
                            <Button size="lg" variant="secondary" onClick={() => setConfirmDel(null)}>{t("common.cancel")}</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <Button size="lg" variant="secondary" onClick={() => { setEditingObs(o.id); setConfirmDel(null); }} aria-label={`${t("observe.editAria")}: ${o.practice_observed}`}>
                            <Pencil size={16} aria-hidden /> {t("common.edit")}
                          </Button>
                          <Button size="lg" variant="danger" onClick={() => setConfirmDel(o.id)} aria-label={`${t("observe.deleteAria")}: ${o.practice_observed}`}>
                            <Trash2 size={16} aria-hidden /> {t("common.delete")}
                          </Button>
                        </div>
                      )
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {canObserve && (
            <div className="border-t border-line pt-4">
              <h3 className="mb-3 text-[15px] font-semibold text-ink-900">{t(observations.length ? "observe.anotherTitle" : "observe.firstTitle")}</h3>
              <ObservationForm visitId={visit.id} first={observations.length === 0} onSaved={() => markSaved("obs")} />
              <details className="mt-3 text-sm text-ink-700">
                <summary className="min-h-11 cursor-pointer py-2 font-medium">{t("observe.tipsTitle")}</summary>
                <ul className="list-disc space-y-1 pl-5">
                  <li>{t("observe.tip1Pre")}{t("observe.tip1Strong")}{t("observe.tip1Post")}</li>
                  <li>{t("observe.tip2")}</li>
                  <li>{t("observe.tip3")}</li>
                  <li>{t("observe.tip4")}</li>
                </ul>
              </details>
            </div>
          )}
          {(status === "planned" || status === "draft") && (
            <Notice tone="info" title={t("observe.startTitle")}>{t("observe.startBody", { status: t(visitStatusKey(status)) })}</Notice>
          )}
          <SavedSlot at={noteFor("obs")} />
          <FailureNotice failure={failFor("obs")} />
        </div>
      </Card>

      <Card>
        <CardHeader title={t("field.next.title")} description={t("field.next.desc")} />
        <div className="space-y-4 px-4 py-4">
          {commitment && !editingNext ? (
            <div data-testid="commitment-item" className="space-y-2 rounded-lg border border-line p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <SyncBadge state={commitment.sync.state} short />
                <CommitmentChip status={commitment.status} />
              </div>
              <p className="font-medium text-ink-900 [overflow-wrap:anywhere]">{commitment.action_text}</p>
              <p>{t("field.next.dueOn", { date: fmtDate(dayOnly(commitment.target_date), locale) })}</p>
              <p className="[overflow-wrap:anywhere]"><span className="text-ink-600">{t("field.next.lookFor")}</span> {commitment.expected_evidence}</p>
              <SyncProblem sync={commitment.sync} />
              {status !== "completed" && (commitment.status === "open" || commitment.status === "completed") && (
                <Button size="lg" variant="secondary" onClick={() => setEditingNext(true)}><Pencil size={16} aria-hidden /> {t("common.edit")}</Button>
              )}
            </div>
          ) : (
            <CommitmentForm visit={visit} existing={commitment} onCancel={commitment ? () => setEditingNext(false) : undefined}
              onSaved={() => { setEditingNext(false); markSaved("next"); }} />
          )}
          <SavedSlot at={noteFor("next")} />
        </div>
      </Card>

      <Card>
        <CardHeader title={t("field.ai.title")} description={t("field.ai.desc")} />
        <div className="space-y-3 px-4 py-4">
          {aiReady ? (
            <a href={`/visits/${visit.id}/feedback`} className={buttonClass("accent", "lg")}>{t("field.ai.open")}</a>
          ) : (
            <>
              <Button size="lg" disabled aria-describedby="ai-reason">{t("field.ai.open")}</Button>
              <p id="ai-reason" className="text-sm text-ink-700">{aiReason}</p>
            </>
          )}
          <p className="text-[13px] text-ink-600">{t("field.ai.never")}</p>
          <a href={hrefTo(`/visit/${visit.id}/report`)} data-testid="report-link" className={buttonClass("secondary", "lg")}>{t("field.report.open")}</a>
        </div>
      </Card>
    </div>
  );
}
