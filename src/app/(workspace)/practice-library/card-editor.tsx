"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { api } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { Button, Card, Notice } from "@/components/ui";
import { Field, Input, Select, Textarea } from "@/components/forms";

export interface EditableCard {
  id?: string; title: string; domain: string; grade_min: number; grade_max: number; subject: string; teaching_language: string; description: string;
  steps: string[]; example_prompts: string[]; next_step: string; variation: string | null; tlm: string[]; tags: string[];
  source_org: string; source_title: string; source_section: string | null; source_url: string | null;
}

export const EMPTY_CARD: EditableCard = {
  title: "", domain: "Reading comprehension", grade_min: 1, grade_max: 3, subject: "Hindi", teaching_language: "any", description: "", steps: [], example_prompts: [],
  next_step: "", variation: "", tlm: [], tags: [], source_org: "", source_title: "", source_section: "", source_url: "",
};

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

export function CardEditor({ initial, mode }: { initial: EditableCard; mode: "create" | "revise" }) {
  const router = useRouter();
  const { t } = useI18n();
  const { run, pending, error } = useAction();
  const [v, setV] = useState({
    ...initial, steps: initial.steps.join("\n"), example_prompts: initial.example_prompts.join("\n"), tlm: initial.tlm.join("\n"), tags: initial.tags.join(", "),
    variation: initial.variation ?? "", source_section: initial.source_section ?? "", source_url: initial.source_url ?? "",
  });
  const f = error?.fields ?? {};
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });

  async function submit() {
    const body = {
      title: v.title, domain: v.domain, grade_min: Number(v.grade_min), grade_max: Number(v.grade_max), subject: v.subject, teaching_language: v.teaching_language,
      description: v.description, steps: lines(v.steps), example_prompts: lines(v.example_prompts), next_step: v.next_step, variation: v.variation,
      tlm: lines(v.tlm), tags: v.tags.split(",").map((t) => t.trim()).filter(Boolean), source_org: v.source_org, source_title: v.source_title,
      source_section: v.source_section || undefined, source_url: v.source_url || "",
    };
    const res = await run(() => (mode === "create" ? api<{ id: string }>("POST", "/practice-cards", body) : api<{ id: string }>("PATCH", `/practice-cards/${initial.id}`, body)), {
      success: mode === "create" ? t("library.editor.createdToast") : t("library.editor.revisedToast"), refresh: false,
    });
    if (res) router.push(`/practice-library/${res.id}`);
  }

  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }} className="mx-auto max-w-3xl space-y-5">
      {mode === "revise" && <Notice tone="warning" title={t("library.editor.revise.title")}>{t("library.editor.revise.body")}</Notice>}
      <Card className="space-y-5 p-5">
        <Field label={t("library.editor.title")} htmlFor="title" required error={f.title}><Input id="title" value={v.title} onChange={set("title")} error={f.title} /></Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("library.editor.domain")} htmlFor="domain" required error={f.domain}><Input id="domain" value={v.domain} onChange={set("domain")} error={f.domain} /></Field>
          <Field label={t("library.editor.subject")} htmlFor="subject" required><Select id="subject" value={v.subject} onChange={set("subject")}>{["Hindi", "English", "Mathematics", "EVS", "Any"].map((s) => <option key={s} value={s}>{t(`library.subject.${s}`)}</option>)}</Select></Field>
          <Field label={t("library.editor.teachingLanguage")} htmlFor="tl"><Select id="tl" value={v.teaching_language} onChange={set("teaching_language")}><option value="any">{t("library.lang.any")}</option><option value="hi">{t("library.lang.hi")}</option><option value="en">{t("library.lang.en")}</option></Select></Field>
          <Field label={t("library.editor.gradeFrom")} htmlFor="gmin" error={f.grade_min}><Input id="gmin" type="number" min={0} max={12} value={v.grade_min} onChange={set("grade_min")} /></Field>
          <Field label={t("library.editor.gradeTo")} htmlFor="gmax" error={f.grade_max}><Input id="gmax" type="number" min={0} max={12} value={v.grade_max} onChange={set("grade_max")} /></Field>
        </div>
        <Field label={t("library.editor.description")} htmlFor="desc" required error={f.description}><Textarea id="desc" value={v.description} onChange={set("description")} error={f.description} /></Field>
        <Field label={t("library.editor.steps")} htmlFor="steps" required error={f.steps}><Textarea id="steps" value={v.steps} onChange={set("steps")} className="min-h-[120px]" error={f.steps} /></Field>
        <Field label={t("library.editor.prompts")} htmlFor="prompts" error={f.example_prompts}><Textarea id="prompts" value={v.example_prompts} onChange={set("example_prompts")} /></Field>
        <Field label={t("library.editor.nextStep")} htmlFor="next" required error={f.next_step}><Textarea id="next" value={v.next_step} onChange={set("next_step")} className="min-h-[64px]" error={f.next_step} /></Field>
        <Field label={t("library.editor.variation")} htmlFor="var" error={f.variation}><Textarea id="var" value={v.variation} onChange={set("variation")} className="min-h-[64px]" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("library.editor.tlm")} htmlFor="tlm"><Textarea id="tlm" value={v.tlm} onChange={set("tlm")} className="min-h-[64px]" /></Field>
          <Field label={t("library.editor.tags")} htmlFor="tags" hint={t("library.editor.tagsHint")}><Textarea id="tags" value={v.tags} onChange={set("tags")} className="min-h-[64px]" /></Field>
        </div>
      </Card>
      <Card className="space-y-5 p-5">
        <h2 className="text-[15px] font-semibold">{t("library.editor.sourceHeading")}</h2>
        <p className="text-[13px] text-ink-600">{t("library.editor.sourceHelp")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("library.editor.sourceOrg")} htmlFor="so" required error={f.source_org}><Input id="so" value={v.source_org} onChange={set("source_org")} error={f.source_org} /></Field>
          <Field label={t("library.editor.sourceTitle")} htmlFor="st" required error={f.source_title}><Input id="st" value={v.source_title} onChange={set("source_title")} error={f.source_title} /></Field>
          <Field label={t("library.editor.sourceSection")} htmlFor="ss"><Input id="ss" value={v.source_section} onChange={set("source_section")} /></Field>
          <Field label={t("library.editor.sourceUrl")} htmlFor="su" error={f.source_url}><Input id="su" type="url" value={v.source_url} onChange={set("source_url")} error={f.source_url} /></Field>
        </div>
      </Card>
      {error && !error.fields && <Notice tone="error">{error.message}</Notice>}
      {error?.fields && <Notice tone="error" title={t("library.editor.fixFields")}>{t("library.editor.fixFieldsBody")}</Notice>}
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={() => router.back()}>{t("common.cancel")}</Button>
        <Button type="submit" variant="accent" disabled={pending}>{pending ? t("common.saving") : mode === "create" ? t("library.editor.create") : t("library.editor.saveVersion")}</Button>
      </div>
    </form>
  );
}
