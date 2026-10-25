"use client";

import Link from "next/link";
import { useState } from "react";
import { Clock, Package, Pencil, ShieldCheck } from "lucide-react";
import { api, newKey } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { AiDraftBadge, Button, Card, CardHeader, Chip, LinkButton, Notice, SimulatedBadge } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm";
import { Field, Input, Select, Textarea } from "@/components/forms";
import { fmtDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";

interface Script {
  id: string; status: "draft" | "edited" | "approved" | "superseded"; language: "en" | "hi"; duration_minutes: number; grade: number; objective: string;
  materials: string[]; steps: { minutes: string; action: string }[]; mentor_script: string; example_interaction: string; variation: string | null;
  reflection_question: string; is_simulated: boolean; provider: string; model: string | null; mentor_edited: boolean; updated_at: string; approved_at: string | null;
  practice_card_id: string; card_version: number;
  source: { title: string; org: string; section: string | null; url: string | null; card_title: string };
}

export function DemoWorkspace(props: DemoProps) {
  return <DemoWorkspaceInner key={JSON.stringify(props.current)} {...props} />;
}

type DemoProps = { visitId: string; visitLanguage: "en" | "hi"; locked: boolean; feedbackApproved: boolean; cards: { id: string; label: string }[]; current: Script | null; ai: { simulated: boolean; label: string; note: string } };

function DemoWorkspaceInner({ visitId, visitLanguage, locked, feedbackApproved, cards, current, ai }: DemoProps) {
  const { t, locale } = useI18n();
  const { run, pending, error } = useAction();
  const [lang, setLang] = useState<"en" | "hi">(current?.language ?? visitLanguage);
  const [minutes, setMinutes] = useState(String(current?.duration_minutes ?? 5));
  const [cardId, setCardId] = useState(cards[0]?.id ?? "");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(current);
  const editable = !!current && current.status !== "approved" && !locked;

  if (!feedbackApproved) {
    return (
      <Notice tone="info" title={t("demo.gate.title")}>
        {t("demo.gate.body")}{" "}
        <Link className="underline" href={`/visits/${visitId}/feedback`}>{t("demo.gate.link")}</Link>.
      </Notice>
    );
  }

  const generate = (use_demo_provider?: boolean) =>
    run(() => api("POST", `/visits/${visitId}/demonstration`, { language: lang, duration_minutes: Number(minutes), practice_card_id: cardId || undefined, use_demo_provider }, { idempotencyKey: newKey() }), { success: t("demo.toast.drafted") });

  if (!current || !draft) {
    return (
      <Card className="max-w-2xl p-6">
        <h2 className="text-lg font-semibold tracking-tight">{t("demo.new.title")}</h2>
        <p className="mt-1.5 text-sm text-ink-600">{t("demo.new.intro")}</p>
        <div className="mt-5 space-y-4">
          <Notice tone={ai.simulated ? "warning" : "info"} title={ai.simulated ? t("demo.simulatedTitle") : ai.label}>{ai.simulated ? t("settings.ai.note.demo") : t("settings.ai.note.anthropic")}</Notice>
          {error && <Notice tone="error" title={t("demo.new.errorTitle")}>{error.message}</Notice>}
          <div className="grid gap-4 sm:grid-cols-3">
            {cards.length > 1 && (
              <Field label={t("demo.new.card")} htmlFor="card"><Select id="card" value={cardId} onChange={(e) => setCardId(e.target.value)}>{cards.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></Field>
            )}
            <Field label={t("demo.new.language")} htmlFor="dl"><Select id="dl" value={lang} onChange={(e) => setLang(e.target.value as "en" | "hi")}><option value="hi">हिन्दी</option><option value="en">English</option></Select></Field>
            <Field label={t("demo.new.minutes")} htmlFor="dm"><Input id="dm" type="number" min={3} max={10} value={minutes} onChange={(e) => setMinutes(e.target.value)} /></Field>
          </div>
          <Button variant="accent" size="lg" disabled={pending || locked} onClick={() => generate()}>{pending ? t("demo.new.drafting") : t("demo.new.generate")}</Button>
        </div>
      </Card>
    );
  }

  const L = draft.language;
  const set = <K extends keyof Script>(k: K, v: Script[K]) => setDraft({ ...draft, [k]: v });
  const dirty = JSON.stringify(draft) !== JSON.stringify(current);
  const save = () => run(() => api("PATCH", `/demonstrations/${current.id}`, {
    objective: draft.objective, materials: draft.materials, steps: draft.steps, mentor_script: draft.mentor_script,
    example_interaction: draft.example_interaction, variation: draft.variation ?? "", reflection_question: draft.reflection_question,
    expected_updated_at: current.updated_at,
  }), { success: t("demo.toast.saved") });

  return (
    <div className="grid gap-6 grid-cols-[minmax(0,1fr)] lg:grid-cols-[1.6fr_1fr]">
      <div className="space-y-5">
        {current.status === "approved" && (
          <Notice tone="success" title={t("demo.approved.title")}>{current.approved_at ? fmtDateTime(current.approved_at, locale) : ""} · {t("demo.approved.next")} <Link className="underline" href={`/visits/${visitId}/report`}>{t("demo.approved.link")}</Link>.</Notice>
        )}
        <Card>
          <CardHeader
            title={t("demo.header.title", { n: current.duration_minutes })}
            description={t("demo.header.description", { grade: current.grade, lang: current.language === "hi" ? "हिन्दी" : "English" })}
            action={<div className="flex flex-wrap items-center gap-2">{current.status === "approved" ? <Chip tone="teal">{t("common.status.feedback.approved")}</Chip> : <Chip tone="amber">{current.status === "edited" ? t("common.status.feedback.edited") : t("demo.status.draft")}</Chip>}{current.is_simulated ? <SimulatedBadge /> : <AiDraftBadge model={current.model} />}</div>}
          />
          <div className="space-y-6 p-5">
            <section>
              <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-600">{t("demo.sec.objective")}</h3>
              {editing ? <Textarea aria-label={t("demo.sec.objective")} lang={L} value={draft.objective} onChange={(e) => set("objective", e.target.value)} className="mt-1.5" /> : <p className="mt-1 text-[15px]" lang={L}>{draft.objective}</p>}
            </section>
            <section>
              <h3 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-600"><Package size={13} aria-hidden /> {t("demo.sec.materials")}</h3>
              {editing ? (
                <Textarea aria-label={t("demo.sec.materialsAria")} lang={L} value={draft.materials.join("\n")} onChange={(e) => set("materials", e.target.value.split("\n").filter(Boolean))} className="mt-1.5 min-h-[64px]" />
              ) : (
                <ul className="mt-1 list-disc pl-5 text-sm" lang={L}>{draft.materials.map((m, i) => <li key={i}>{m}</li>)}</ul>
              )}
            </section>
            <section>
              <h3 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-600"><Clock size={13} aria-hidden /> {t("demo.sec.steps")}</h3>
              <ol className="mt-2 space-y-2.5">
                {draft.steps.map((s, i) => (
                  <li key={i} className="flex gap-3 rounded-lg border border-line p-3 text-sm">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-900 text-[11px] font-semibold text-white" aria-hidden>{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[12px] text-ink-600">{s.minutes}</p>
                      {editing ? <Textarea aria-label={t("demo.sec.stepAria", { n: i + 1 })} lang={L} value={s.action} onChange={(e) => set("steps", draft.steps.map((x, j) => (j === i ? { ...x, action: e.target.value } : x)))} className="mt-1 min-h-[56px]" /> : <p lang={L}>{s.action}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
            <section>
              <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-600">{t("demo.sec.script")}</h3>
              {editing ? <Textarea aria-label={t("demo.sec.scriptAria")} lang={L} value={draft.mentor_script} onChange={(e) => set("mentor_script", e.target.value)} className="mt-1.5 min-h-[140px]" /> : <p className="mt-1 whitespace-pre-line rounded-lg bg-ink-50 p-3.5 text-sm leading-relaxed" lang={L}>{draft.mentor_script}</p>}
            </section>
            <section>
              <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-600">{t("demo.sec.example")}</h3>
              {editing ? <Textarea aria-label={t("demo.sec.exampleAria")} lang={L} value={draft.example_interaction} onChange={(e) => set("example_interaction", e.target.value)} className="mt-1.5 min-h-[110px]" /> : <p className="mt-1 whitespace-pre-line rounded-lg border border-line p-3.5 text-sm leading-relaxed" lang={L}>{draft.example_interaction}</p>}
            </section>
            <section>
              <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-600">{t("demo.sec.variation")}</h3>
              {editing ? <Textarea aria-label={t("demo.sec.variationAria")} lang={L} value={draft.variation ?? ""} onChange={(e) => set("variation", e.target.value)} className="mt-1.5 min-h-[64px]" /> : <p className="mt-1 text-sm" lang={L}>{draft.variation}</p>}
            </section>
            <section>
              <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-600">{t("demo.sec.reflection")}</h3>
              {editing ? <Textarea aria-label={t("demo.sec.reflectionAria")} lang={L} value={draft.reflection_question} onChange={(e) => set("reflection_question", e.target.value)} className="mt-1.5 min-h-[64px]" /> : <p className="mt-1 text-sm" lang={L}>{draft.reflection_question}</p>}
            </section>
          </div>
          {editable && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4">
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setEditing((e) => !e)}><Pencil size={15} aria-hidden /> {editing ? t("demo.stopEditing") : t("demo.editScript")}</Button>
                <ConfirmButton variant="secondary" label={t("demo.regen.label")} title={t("demo.regen.title")} description={t("demo.regen.description")} confirmLabel={t("demo.regen.confirm")} disabled={pending} onConfirm={() => void generate()} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" disabled={!dirty || pending} onClick={save}>{t("demo.saveChanges")}</Button>
                <ConfirmButton
                  variant="accent" label={<><ShieldCheck size={15} aria-hidden /> {t("demo.approve.label")}</>} title={t("demo.approve.title")} confirmLabel={t("demo.approve.confirm")}
                  description={t("demo.approve.description")}
                  disabled={pending}
                  onConfirm={async () => { if (dirty) { const ok = await save(); if (!ok) return; } await run(() => api("POST", `/demonstrations/${current.id}/approve`), { success: t("demo.toast.approved") }); }}
                />
              </div>
            </div>
          )}
        </Card>
      </div>

      <aside className="space-y-5">
        <Card>
          <CardHeader title={t("demo.source.title")} description={t("demo.source.description")} />
          <div className="space-y-2 p-5 text-sm">
            <p className="font-medium"><span className="font-mono text-[13px]">{current.practice_card_id}</span> · {current.source.card_title}</p>
            <p className="text-ink-700">{current.source.title}</p>
            <p className="text-[13px] text-ink-600">{t("demo.source.meta", { org: current.source.org, version: current.card_version })}{current.source.section ? ` · ${current.source.section}` : ""}</p>
            <LinkButton href={`/practice-library/${current.practice_card_id}`} variant="secondary" size="sm">{t("demo.source.inspect")}</LinkButton>
          </div>
        </Card>
        <Notice tone="info" title={t("demo.note.title")}>{t("demo.note.body")}</Notice>
      </aside>
    </div>
  );
}
