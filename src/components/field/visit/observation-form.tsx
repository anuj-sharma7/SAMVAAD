"use client";

import { useRef, useState } from "react";
import { Button, Notice } from "@/components/ui";
import { Field, Textarea } from "@/components/forms";
import { useI18n } from "@/lib/i18n/client";
import { useField } from "@/lib/offline/field-context";
import { useUnsavedWarning } from "@/lib/client/use-unsaved-warning";
import type { LocalObservation } from "@/lib/offline/types";
import { describeFailure, describedBy, FailureNotice, type Failure } from "./shared";

const EVALUATIVE = /\b(lazy|weak teacher|bad teacher|poor teacher|incompetent|useless|careless)\b/i;
// \b does not work with Devanagari, so Hindi judging words are matched separately.
const EVALUATIVE_HI = /(आलसी|निकम्मा|निकम्मी|नकारा|बेकार टीचर|बेकार शिक्षक|कमज़ोर शिक्षक|कमजोर शिक्षक|लापरवाह|अयोग्य)/;

type Values = { practice_observed: string; evidence: string; worked_well: string; improvement_area: string; context_note: string };

export function ObservationForm({ visitId, initial, first, onSaved, onCancel }: {
  visitId: string; initial?: LocalObservation; first?: boolean; onSaved: () => void; onCancel?: () => void;
}) {
  const { t } = useI18n();
  const { store } = useField();
  const [v, setV] = useState<Values>({
    practice_observed: initial?.practice_observed ?? "", evidence: initial?.evidence ?? "", worked_well: initial?.worked_well ?? "",
    improvement_area: initial?.improvement_area ?? "", context_note: initial?.context_note ?? "",
  });
  const [failure, setFailure] = useState<Failure | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false); // a double-click must not save twice
  const p = initial ? `obs-${initial.id}` : "obs-new";
  const f = failure?.fields ?? {};

  useUnsavedWarning(!initial && Object.values(v).some((x) => x.trim()));
  const set = (k: keyof Values) => (e: React.ChangeEvent<HTMLTextAreaElement>) => setV((x) => ({ ...x, [k]: e.target.value }));
  const allText = Object.values(v).join(" ");
  const flagged = EVALUATIVE.test(allText) || EVALUATIVE_HI.test(allText);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy.current || !store) return;
    busy.current = true;
    setSaving(true);
    setFailure(null);
    try {
      await store.saveObservation(visitId, v, initial?.id);
      if (!initial) setV({ practice_observed: "", evidence: "", worked_well: "", improvement_area: "", context_note: "" });
      onSaved(); // only now: the local save resolved
    } catch (err) {
      setFailure(describeFailure(t, err)); // the typed text stays in the form
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  const area = (k: keyof Values, label: string, hint?: string, placeholder?: string, req = false) => {
    const id = `${p}-${k}`;
    return (
      <Field label={label} hint={hint} error={f[k]} htmlFor={id} required={req}>
        <Textarea id={id} name={k} value={v[k]} onChange={set(k)} error={f[k]} placeholder={placeholder} aria-describedby={describedBy(id, !!f[k], !!hint)} className="min-h-24" />
      </Field>
    );
  };

  return (
    <form onSubmit={submit} noValidate data-testid="obs-form" className="space-y-4" aria-label={t(initial ? "observe.editAria" : first ? "observe.firstTitle" : "observe.anotherTitle")}>
      {area("practice_observed", t("observe.practice"), t("observe.practiceHint"), undefined, true)}
      {area("evidence", t("observe.evidence"), t("observe.evidenceHint"), undefined, true)}
      {area("worked_well", t("observe.workedWell"))}
      {area("improvement_area", t("observe.grow"), t("observe.growHint"))}
      {area("context_note", t("observe.context"), undefined, t("observe.contextPlaceholder"))}
      {flagged && <Notice tone="warning" title={t("observe.flaggedTitle")}>{t("observe.flaggedBody")}</Notice>}
      <FailureNotice failure={failure} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="lg" disabled={saving} data-testid="obs-submit">{saving ? t("field.saving") : t(initial ? "observe.saveChanges" : "observe.saveObservation")}</Button>
        {onCancel && <Button type="button" size="lg" variant="secondary" onClick={onCancel}>{t("common.cancel")}</Button>}
      </div>
    </form>
  );
}
