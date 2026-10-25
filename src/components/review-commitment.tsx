"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { useI18n } from "@/lib/i18n/client";
import { Button, Notice } from "./ui";
import { Field, Select, Textarea } from "./forms";

/**
 * Record, during a LATER visit, what happened to an earlier commitment.
 * Not trying the action is a conversation about support, never a mark against the teacher.
 * `label` is optional: when omitted the translated default is used.
 */
export function ReviewCommitmentButton({
  commitmentId, actionText, visits, label,
}: {
  commitmentId: string;
  actionText: string;
  visits: { id: string; label: string }[];
  label?: string;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const { run, pending, error } = useAction();
  const [outcome, setOutcome] = useState("tried_working");
  const f = error?.fields ?? {};

  async function submit(form: HTMLFormElement) {
    const d = new FormData(form);
    const res = await run(
      () => api("POST", `/commitments/${commitmentId}/review`, {
        review_visit_id: d.get("review_visit_id"), outcome, evidence: String(d.get("evidence") ?? ""),
        barriers: String(d.get("barriers") ?? ""), notes: String(d.get("notes") ?? ""),
      }),
      { success: t("report.review.toast") },
    );
    if (res) ref.current?.close();
  }

  if (visits.length === 0) {
    return <span className="text-[13px] text-ink-600">{t("report.review.noVisit")}</span>;
  }
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => ref.current?.showModal()}>{label ?? t("report.review.defaultLabel")}</Button>
      <dialog ref={ref} aria-labelledby={`rv-${commitmentId}`} className="m-auto w-[min(34rem,calc(100vw-2rem))] rounded-xl border border-line bg-card p-0 text-ink-900 shadow-2xl backdrop:bg-ink-900/40">
        <form noValidate onSubmit={(e) => { e.preventDefault(); void submit(e.currentTarget); }}>
          <div className="space-y-4 p-5">
            <h2 id={`rv-${commitmentId}`} className="text-base font-semibold">{t("report.review.title")}</h2>
            <p className="rounded-lg bg-ink-50 p-3 text-sm" lang={/[ऀ-ॿ]/.test(actionText) ? "hi" : undefined}>{actionText}</p>
            <Field label={t("report.review.visit")} htmlFor="review_visit_id" required error={f.review_visit_id}>
              <Select id="review_visit_id" name="review_visit_id" defaultValue={visits[0].id}>{visits.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</Select>
            </Field>
            <Field label={t("report.review.attempted")} htmlFor="outcome" required>
              <Select id="outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                <option value="tried_working">{t("report.review.optWorking")}</option>
                <option value="tried_needs_support">{t("report.review.optSupport")}</option>
                <option value="not_tried">{t("report.review.optNotTried")}</option>
              </Select>
            </Field>
            {outcome !== "not_tried" && (
              <Field label={t("report.review.evidence")} htmlFor="evidence" required error={f.evidence} hint={t("report.review.evidenceHint")}>
                <Textarea id="evidence" name="evidence" maxLength={800} error={f.evidence} />
              </Field>
            )}
            {outcome !== "tried_working" && (
              <Field label={t("report.review.barriers")} htmlFor="barriers" required error={f.barriers} hint={t("report.review.barriersHint")}>
                <Textarea id="barriers" name="barriers" maxLength={800} error={f.barriers} />
              </Field>
            )}
            <Field label={t("report.review.notes")} htmlFor="notes"><Textarea id="notes" name="notes" maxLength={800} /></Field>
            <Notice tone="info">{t("report.review.notice")}</Notice>
          </div>
          <div className="flex justify-end gap-2 border-t border-line bg-ink-50 px-5 py-3">
            <Button variant="secondary" onClick={() => ref.current?.close()}>{t("common.cancel")}</Button>
            <Button type="submit" variant="accent" disabled={pending}>{pending ? t("report.review.saving") : t("report.review.save")}</Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
