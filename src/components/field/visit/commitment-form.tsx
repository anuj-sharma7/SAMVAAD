"use client";

import { useRef, useState } from "react";
import { Button, Notice } from "@/components/ui";
import { Field, Input, Textarea } from "@/components/forms";
import { useI18n } from "@/lib/i18n/client";
import { useField } from "@/lib/offline/field-context";
import { useUnsavedWarning } from "@/lib/client/use-unsaved-warning";
import type { LocalCommitment, LocalVisit } from "@/lib/offline/types";
import { addDays, describeFailure, describedBy, FailureNotice, toDateInput, type Failure } from "./shared";

/** One agreed next step per visit. Disabled, with the reason, until the visit has been started. */
export function CommitmentForm({ visit, existing, onSaved, onCancel }: {
  visit: LocalVisit; existing?: LocalCommitment; onSaved: () => void; onCancel?: () => void;
}) {
  const { t } = useI18n();
  const { store } = useField();
  const [v, setV] = useState(() => {
    const base = new Date(Math.max(Date.now(), Date.parse(visit.scheduled_at)));
    return {
      action_text: existing?.action_text ?? "", target_date: existing?.target_date ?? toDateInput(addDays(base, 7)), expected_evidence: existing?.expected_evidence ?? "",
    };
  });
  const [failure, setFailure] = useState<Failure | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const f = failure?.fields ?? {};
  const started = visit.status !== "draft" && visit.status !== "planned";
  const locked = visit.status === "completed";
  const disabled = !started || locked;
  useUnsavedWarning(!existing && (v.action_text.trim() !== "" || v.expected_evidence.trim() !== ""));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy.current || !store || disabled) return;
    busy.current = true;
    setSaving(true);
    setFailure(null);
    try {
      await store.saveCommitment(visit.id, v, existing?.id);
      onSaved();
    } catch (err) {
      setFailure(describeFailure(t, err));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((x) => ({ ...x, [k]: e.target.value }));
  const reasonId = "commitment-disabled-reason";

  return (
    <form onSubmit={submit} noValidate data-testid="commitment-form" className="space-y-4" aria-label={t("field.next.title")}>
      {disabled && (
        <div id={reasonId}><Notice tone="info">{t(locked ? "observe.lockCompleted" : "field.next.startFirst")}</Notice></div>
      )}
      <Field label={t("field.next.action")} hint={t("field.next.actionHint")} error={f.action_text} htmlFor="c-action" required>
        <Textarea id="c-action" name="action_text" value={v.action_text} onChange={set("action_text")} error={f.action_text} disabled={disabled}
          aria-describedby={describedBy("c-action", !!f.action_text, true)} />
      </Field>
      <Field label={t("field.next.target")} error={f.target_date} htmlFor="c-target" required>
        <Input id="c-target" name="target_date" type="date" value={v.target_date} onChange={set("target_date")} error={f.target_date} disabled={disabled} className="min-h-11"
          aria-describedby={describedBy("c-target", !!f.target_date, false)} />
      </Field>
      <Field label={t("field.next.evidence")} hint={t("field.next.evidenceHint")} error={f.expected_evidence} htmlFor="c-evidence" required>
        <Textarea id="c-evidence" name="expected_evidence" value={v.expected_evidence} onChange={set("expected_evidence")} error={f.expected_evidence} disabled={disabled}
          aria-describedby={describedBy("c-evidence", !!f.expected_evidence, true)} />
      </Field>
      <FailureNotice failure={failure} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="lg" disabled={saving || disabled} aria-describedby={disabled ? reasonId : undefined} data-testid="commitment-submit">
          {saving ? t("field.saving") : t(existing ? "observe.saveChanges" : "field.next.save")}
        </Button>
        {onCancel && <Button type="button" size="lg" variant="secondary" onClick={onCancel}>{t("common.cancel")}</Button>}
      </div>
    </form>
  );
}
