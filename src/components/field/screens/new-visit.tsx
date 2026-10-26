"use client";

import { useEffect, useRef, useState } from "react";
import { Button, buttonClass, Card, EmptyState, Notice, PageHeader } from "@/components/ui";
import { Field, Input, Select, Textarea } from "@/components/forms";
import { describeFailure, describedBy, FailureNotice, addDays, dayOnly, toDateTimeInput, type Failure } from "@/components/field/visit/shared";
import { useI18n } from "@/lib/i18n/client";
import { useField, useLive } from "@/lib/offline/field-context";
import { hrefTo, useHashRoute } from "@/lib/offline/use-hash-route";
import { useUnsavedWarning } from "@/lib/client/use-unsaved-warning";
import { fmtDate } from "@/lib/format";
import { PURPOSES, SUBJECTS, purposeLabel, subjectLabel } from "@/lib/visit-labels";
import type { Lang, Snapshot } from "@/lib/offline/types";

function tomorrowTen(): string {
  const d = addDays(new Date(), 1);
  d.setHours(10, 0, 0, 0);
  return toDateTimeInput(d);
}

export function NewVisitScreen({ schoolId }: { schoolId?: string }) {
  const { t, locale } = useI18n();
  const { store } = useField();
  const { go } = useHashRoute();
  const schools = useLive((s) => s.listSchools());
  const [v, setV] = useState(() => ({
    school_id: schoolId ?? "", teacher_alias: "", when: tomorrowTen(), grade: "1", subject: "Hindi", language: "hi" as Lang,
    purpose: PURPOSES[0] as string, coaching_focus: "", prep_notes: "",
  }));
  const [failure, setFailure] = useState<Failure | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const busy = useRef(false);
  const langTouched = useRef(false);
  const f = failure?.fields ?? {};

  // Default coaching language = the account's preferred language, when the device knows it.
  useEffect(() => {
    if (!store) return;
    let alive = true;
    store.getMeta<Snapshot["account"]>("account").then((a) => {
      if (alive && a && !langTouched.current && (a.preferred_language === "en" || a.preferred_language === "hi")) setV((x) => ({ ...x, language: a.preferred_language }));
    }, () => undefined);
    return () => { alive = false; };
  }, [store]);

  const aliasKey = v.teacher_alias.trim();
  const earlier = useLive(async (s) => (v.school_id && aliasKey ? s.openCommitmentsFor(v.school_id, aliasKey) : []), [v.school_id, aliasKey]);
  const dirty = !done && [v.teacher_alias, v.coaching_focus, v.prep_notes].some((x) => x.trim() !== "");
  useUnsavedWarning(dirty);

  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    if (k === "language") langTouched.current = true;
    setV((x) => ({ ...x, [k]: e.target.value }));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy.current || !store) return;
    busy.current = true;
    setSaving(true);
    setFailure(null);
    try {
      const ms = Date.parse(v.when);
      const visit = await store.createVisit({
        school_id: v.school_id, teacher_alias: v.teacher_alias, scheduled_at: Number.isNaN(ms) ? "" : new Date(ms).toISOString(), grade: v.grade,
        subject: v.subject, language: v.language, purpose: v.purpose, coaching_focus: v.coaching_focus, prep_notes: v.prep_notes,
      });
      setDone(true);
      go(`/visit/${visit.id}?new=1`);
    } catch (err) {
      setFailure(describeFailure(t, err)); // everything typed stays on the screen
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  if (schools.loading && !schools.data) return <p role="status" className="p-4 text-ink-600">{t("common.loading")}</p>;
  if (!schools.data || schools.data.length === 0) {
    return (
      <EmptyState title={t("field.new.noSchoolsTitle")} description={t("field.new.noSchoolsBody")}
        action={<a href={hrefTo("/")} className={buttonClass("primary", "lg")}>{t("field.back")}</a>} />
    );
  }
  const first = earlier.data?.[0];
  const control = "min-h-11";

  return (
    <div className="space-y-4">
      <PageHeader title={t("field.new.title")} description={t("field.new.desc")} />
      <form onSubmit={submit} noValidate data-testid="new-visit-form" aria-label={t("field.new.title")}>
        <Card>
          <div className="space-y-4 px-4 py-4">
            <Field label={t("visits.new.school")} error={f.school_id} htmlFor="nv-school" required>
              <Select id="nv-school" name="school_id" value={v.school_id} onChange={set("school_id")} error={f.school_id} className={control} aria-describedby={describedBy("nv-school", !!f.school_id, false)}>
                <option value="">{t("visits.new.selectSchool")}</option>
                {schools.data.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label={t("visits.new.alias")} hint={t("field.new.aliasHint")} error={f.teacher_alias} htmlFor="nv-alias" required>
              <Input id="nv-alias" name="teacher_alias" value={v.teacher_alias} onChange={set("teacher_alias")} error={f.teacher_alias} className={control} autoComplete="off"
                placeholder="T-101" aria-describedby={describedBy("nv-alias", !!f.teacher_alias, true)} />
            </Field>
            {first && (
              <Notice tone="info" title={t("field.followUp.title")}>
                <p className="[overflow-wrap:anywhere]">{first.action_text}</p>
                <p className="mt-1 text-[13px]">{t("field.followUp.meta", { date: fmtDate(dayOnly(first.target_date), locale), evidence: first.expected_evidence })}</p>
              </Notice>
            )}
            <Field label={t("visits.new.when")} error={f.scheduled_at} htmlFor="nv-when" required>
              <Input id="nv-when" name="when" type="datetime-local" value={v.when} onChange={set("when")} error={f.scheduled_at} className={control} aria-describedby={describedBy("nv-when", !!f.scheduled_at, false)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("visits.new.grade")} error={f.grade} htmlFor="nv-grade" required>
                <Select id="nv-grade" name="grade" value={v.grade} onChange={set("grade")} error={f.grade} className={control}>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((g) => <option key={g} value={g}>{t("visits.grade", { grade: g })}</option>)}
                </Select>
              </Field>
              <Field label={t("visits.new.subject")} error={f.subject} htmlFor="nv-subject" required>
                <Select id="nv-subject" name="subject" value={v.subject} onChange={set("subject")} error={f.subject} className={control}>
                  {SUBJECTS.map((s) => <option key={s} value={s}>{subjectLabel(t, s)}</option>)}
                </Select>
              </Field>
            </div>
            <Field label={t("visits.new.language")} hint={t("field.new.languageHint")} error={f.language} htmlFor="nv-lang">
              <Select id="nv-lang" name="language" value={v.language} onChange={set("language")} error={f.language} className={control} aria-describedby={describedBy("nv-lang", !!f.language, true)}>
                <option value="hi">{t("visits.new.langHi")}</option>
                <option value="en">{t("visits.new.langEn")}</option>
              </Select>
            </Field>
            <Field label={t("visits.new.purpose")} error={f.purpose} htmlFor="nv-purpose" required>
              <Select id="nv-purpose" name="purpose" value={v.purpose} onChange={set("purpose")} error={f.purpose} className={control} aria-describedby={describedBy("nv-purpose", !!f.purpose, false)}>
                {PURPOSES.map((p) => <option key={p} value={p}>{purposeLabel(t, p)}</option>)}
              </Select>
            </Field>
            <Field label={t("visits.new.focus")} hint={t("visits.new.focusHint")} error={f.coaching_focus} htmlFor="nv-focus">
              <Input id="nv-focus" name="coaching_focus" value={v.coaching_focus} onChange={set("coaching_focus")} error={f.coaching_focus} className={control}
                placeholder={t("visits.new.focusPlaceholder")} aria-describedby={describedBy("nv-focus", !!f.coaching_focus, true)} />
            </Field>
            <Field label={t("visits.new.prep")} error={f.prep_notes} htmlFor="nv-prep">
              <Textarea id="nv-prep" name="prep_notes" value={v.prep_notes} onChange={set("prep_notes")} error={f.prep_notes} placeholder={t("visits.new.prepPlaceholder")}
                aria-describedby={describedBy("nv-prep", !!f.prep_notes, false)} />
            </Field>
            <FailureNotice failure={failure} />
            <div aria-live="polite">{done && <p className="text-sm text-ink-700">{t("field.new.savedGoing")}</p>}</div>
            <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={saving || done} data-testid="visit-submit">
              {saving ? t("field.saving") : t("field.new.save")}
            </Button>
            <p className="text-[13px] text-ink-600">{t("field.new.offlineNote")}</p>
          </div>
        </Card>
      </form>
    </div>
  );
}
