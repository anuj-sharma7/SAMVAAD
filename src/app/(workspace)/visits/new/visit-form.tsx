"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { api, newKey } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { useUnsavedWarning } from "@/lib/client/use-unsaved-warning";
import { Button, Card, CommitmentChip, Notice } from "@/components/ui";
import { Field, Input, Select, Textarea } from "@/components/forms";
import { fmtDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { PURPOSES, SUBJECTS, purposeLabel, subjectLabel } from "@/lib/visit-labels";

interface Pending { id: string; school_id: string; teacher_alias: string; action_text: string; target_date: string; display_status: string }

function defaultWhen() {
  const d = new Date(Date.now() + 86_400_000);
  d.setHours(10, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function VisitForm({ schools, pending, defaultSchool, defaultLanguage = "hi" }: { schools: { id: string; name: string; code: string }[]; pending: Pending[]; defaultSchool?: string; defaultLanguage?: "en" | "hi" }) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { run, pending: busy, error } = useAction();
  const [schoolId, setSchoolId] = useState(defaultSchool ?? "");
  const [alias, setAlias] = useState("");
  const [language, setLanguage] = useState<string>(defaultLanguage);
  const [subject, setSubject] = useState("Hindi");
  const [purpose, setPurpose] = useState<string>(PURPOSES[0]);
  const [ignorePrev, setIgnorePrev] = useState(false);
  useUnsavedWarning(alias.trim().length > 0 && !busy); // in-memory only; the browser asks before the page is closed
  const submitKey = useRef(newKey()); // one key per form: a double-click or retry cannot create two visits

  const match = useMemo(
    () => pending.filter((p) => p.school_id === schoolId && (!alias.trim() || p.teacher_alias.toLowerCase() === alias.trim().toLowerCase())),
    [pending, schoolId, alias],
  );
  const prev = !ignorePrev ? match[0] : undefined;
  const f = error?.fields ?? {};

  async function submit(save_as: "draft" | "planned", form: HTMLFormElement) {
    const d = new FormData(form);
    const when = String(d.get("scheduled_at"));
    const v = await run(
      () =>
        api<{ id: string }>("POST", "/visits", {
          school_id: schoolId, teacher_alias: alias, scheduled_at: when ? new Date(when).toISOString() : "", grade: Number(d.get("grade")), subject, language, purpose,
          coaching_focus: String(d.get("coaching_focus") ?? ""), prep_notes: String(d.get("prep_notes") ?? ""),
          previous_commitment_id: prev?.id ?? "", observation_method: d.get("observation_method"), save_as,
        }, { idempotencyKey: submitKey.current }),
      { success: save_as === "draft" ? t("visits.new.draftSaved") : t("visits.action.planned"), refresh: false },
    );
    if (v) router.push(`/visits/${v.id}`);
  }

  return (
    <form
      noValidate
      onSubmit={(e) => { e.preventDefault(); void submit("planned", e.currentTarget); }}
      className="space-y-5"
    >
      <Card className="space-y-5 p-5">
        <h2 className="text-[15px] font-semibold">{t("visits.new.sectionWhere")}</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("visits.new.school")} htmlFor="school_id" required error={f.school_id}>
            <Select id="school_id" value={schoolId} onChange={(e) => { setSchoolId(e.target.value); setIgnorePrev(false); }} error={f.school_id} required>
              <option value="">{t("visits.new.selectSchool")}</option>
              {schools.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
            </Select>
          </Field>
          <Field label={t("visits.new.alias")} htmlFor="teacher_alias" required hint={t("visits.new.aliasHint")} error={f.teacher_alias}>
            <Input id="teacher_alias" value={alias} onChange={(e) => { setAlias(e.target.value); setIgnorePrev(false); }} placeholder="T-101" maxLength={60} error={f.teacher_alias} />
          </Field>
          <Field label={t("visits.new.when")} htmlFor="scheduled_at" required error={f.scheduled_at}>
            <Input id="scheduled_at" name="scheduled_at" type="datetime-local" defaultValue={defaultWhen()} error={f.scheduled_at} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t("visits.new.grade")} htmlFor="grade" required error={f.grade}>
              <Select id="grade" name="grade" defaultValue="2" error={f.grade}>{[1, 2, 3, 4, 5, 6, 7, 8].map((g) => <option key={g} value={g}>{t("visits.grade", { grade: g })}</option>)}</Select>
            </Field>
            <Field label={t("visits.new.subject")} htmlFor="subject" required error={f.subject}>
              <Select id="subject" value={subject} onChange={(e) => { setSubject(e.target.value); if (e.target.value === "Hindi") setLanguage("hi"); }} error={f.subject}>{SUBJECTS.map((s) => <option key={s} value={s}>{subjectLabel(t, s)}</option>)}</Select>
            </Field>
          </div>
          <Field label={t("visits.new.language")} htmlFor="language" hint={t("visits.new.languageHint")} error={f.language}>
            <Select id="language" value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="hi">{t("visits.new.langHi")}</option>
              <option value="en">{t("visits.new.langEn")}</option>
            </Select>
          </Field>
          <Field label={t("visits.new.method")} htmlFor="observation_method" error={f.observation_method}>
            <Select id="observation_method" name="observation_method" defaultValue="text"><option value="text">{t("visits.new.methodText")}</option><option value="checklist">{t("visits.new.methodChecklist")}</option></Select>
          </Field>
        </div>
      </Card>

      <Card className="space-y-5 p-5">
        <h2 className="text-[15px] font-semibold">{t("visits.new.sectionPurpose")}</h2>
        <Field label={t("visits.new.purpose")} htmlFor="purpose" required error={f.purpose}>
          <Select id="purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} error={f.purpose}>{PURPOSES.map((p) => <option key={p} value={p}>{purposeLabel(t, p)}</option>)}</Select>
        </Field>
        <Field label={t("visits.new.focus")} htmlFor="coaching_focus" hint={t("visits.new.focusHint")} error={f.coaching_focus}>
          <Input id="coaching_focus" name="coaching_focus" maxLength={300} placeholder={t("visits.new.focusPlaceholder")} />
        </Field>

        {prev ? (
          <div className="rounded-lg border border-amber-100 bg-amber-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-amber-800"><RotateCcw size={15} aria-hidden /> {t("visits.new.followTitle")}</p>
                <p className="mt-1.5 text-sm text-ink-900" lang={/[ऀ-ॿ]/.test(prev.action_text) ? "hi" : undefined}>{prev.action_text}</p>
                <p className="mt-1 text-[13px] text-ink-600">{t("visits.new.followMeta", { alias: prev.teacher_alias, date: fmtDate(prev.target_date, locale) })}</p>
              </div>
              <CommitmentChip status={prev.display_status} />
            </div>
            <button type="button" className="mt-2 text-[13px] text-ink-600 underline" onClick={() => setIgnorePrev(true)}>{t("visits.new.notFollow")}</button>
          </div>
        ) : schoolId && alias.trim() && match.length === 0 ? (
          <Notice tone="info">{t("visits.new.noPending")}</Notice>
        ) : null}

        <Field label={t("visits.new.prep")} htmlFor="prep_notes" error={f.prep_notes}>
          <Textarea id="prep_notes" name="prep_notes" maxLength={1000} placeholder={t("visits.new.prepPlaceholder")} />
        </Field>
      </Card>

      {error && !error.fields && <Notice tone="error" title={t("visits.new.couldNotSave")}>{error.message}</Notice>}
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="secondary" disabled={busy} onClick={(e) => void submit("draft", (e.currentTarget as HTMLButtonElement).form!)}>{t("visits.new.saveDraft")}</Button>
        <Button type="submit" variant="accent" disabled={busy}>{busy ? t("common.saving") : t("visits.action.plan")}</Button>
      </div>
    </form>
  );
}
