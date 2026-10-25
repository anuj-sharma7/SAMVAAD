"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { useI18n } from "@/lib/i18n/client";
import { LOCALES, LOCALE_NAME, isLocale, type Locale } from "@/lib/i18n/config";
import { Button, Notice } from "@/components/ui";
import { Field, Input, Select } from "@/components/forms";

/** Two independent preferences: the language of the interface, and the default language for coaching content. */
export function PreferencesForm({ initial }: { initial: "en" | "hi" }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { run, pending } = useAction();
  const [lang, setLang] = useState(initial);
  const [ui, setUi] = useState<Locale>(locale);
  return (
    <div className="space-y-5">
      <p className="text-[13px] text-ink-600">{t("settings.lang.explain")}</p>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => { await api("PUT", "/locale", { locale: ui }); router.refresh(); }, { success: t("settings.lang.interfaceSaved"), refresh: false });
        }}
      >
        <Field label={t("settings.lang.interfaceLabel")} htmlFor="ui-lang" hint={t("settings.lang.interfaceHint")}>
          <Select id="ui-lang" value={ui} onChange={(e) => { if (isLocale(e.target.value)) setUi(e.target.value); }} className="w-48">
            {LOCALES.map((l) => <option key={l} value={l} lang={l}>{LOCALE_NAME[l]}</option>)}
          </Select>
        </Field>
        <Button type="submit" variant="secondary" disabled={pending || ui === locale}>{t("common.save")}</Button>
      </form>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => { e.preventDefault(); void run(() => api("PATCH", "/me", { preferred_language: lang }), { success: t("settings.lang.coachingSaved") }); }}
      >
        <Field label={t("settings.lang.coachingLabel")} htmlFor="pl" hint={t("settings.lang.coachingHint")}>
          <Select id="pl" value={lang} onChange={(e) => setLang(e.target.value as "en" | "hi")} className="w-48">
            {LOCALES.map((l) => <option key={l} value={l} lang={l}>{LOCALE_NAME[l]}</option>)}
          </Select>
        </Field>
        <Button type="submit" variant="secondary" disabled={pending || lang === initial}>{t("common.save")}</Button>
      </form>
    </div>
  );
}

type Rules = Record<string, number>;
const FIELDS: [keyof Rules & string, string][] = [
  ["overdue_commitment", "points"],
  ["due_soon_commitment", "points"],
  ["unreviewed_completed_action", "points"],
  ["no_recent_visit", "points"],
  ["no_recent_visit_days", "days"],
  ["visit_scheduled_soon", "points"],
  ["visit_scheduled_soon_days", "days"],
  ["high_threshold", "points"],
  ["medium_threshold", "points"],
];

export function PriorityRulesForm({ rules, canEdit }: { rules: Rules; canEdit: boolean }) {
  const { t } = useI18n();
  const { run, pending, error } = useAction();
  const [v, setV] = useState<Rules>(rules);
  return (
    <form onSubmit={(e) => { e.preventDefault(); void run(() => api("PUT", "/settings/priority-rules", v), { success: t("settings.rules.saved") }); }} className="space-y-3">
      <p className="text-[13px] text-ink-600">{t("settings.rules.signals")}</p>
      <div className="space-y-2.5">
        {FIELDS.map(([k, unit]) => (
          <div key={k} className="grid grid-cols-[1fr_6rem_auto] items-center gap-3 text-sm">
            <label htmlFor={`r-${k}`}>{t(`settings.rule.${k}`)}</label>
            <Input id={`r-${k}`} type="number" min={0} value={v[k]} disabled={!canEdit} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })} className="h-9" error={error?.fields?.[k]} />
            <span className="min-w-10 text-ink-600">{t(`settings.unit.${unit}`)}</span>
          </div>
        ))}
      </div>
      {error && <Notice tone="error">{error.message}</Notice>}
      {canEdit ? <Button type="submit" variant="secondary" disabled={pending}>{t("settings.rules.saveRules")}</Button> : <p className="text-[13px] text-ink-600">{t("settings.rules.supervisorsOnly")}</p>}
    </form>
  );
}
