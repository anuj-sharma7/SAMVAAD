"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BookMarked, Eye, EyeOff, RefreshCw, ShieldCheck } from "lucide-react";
import { api, newKey } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { AiDraftBadge, Button, Card, CardHeader, Chip, FeedbackChip, LinkButton, Notice, OriginBadge, SimulatedBadge } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm";
import { Field, Select, Textarea } from "@/components/forms";
import { fmtDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";

interface Citation { practice_card_id: string; origin: "illustrative" | "official_source"; chunks: { chunk_id: string; pdf_page: number; printed_page: number | null; excerpt: string }[]; card_version: number; source_title: string; source_section: string | null; source_url: string | null; relevance_reason: string; retrieved_rank: number | null; is_primary: boolean }
interface Draft {
  id: string; status: string; language: "en" | "hi"; strength: string | null; priority_practice: string | null; next_step: string | null;
  ask_question: string | null; describe_statement: string | null; ask_again_question: string | null;
  evidence: { observation_id: string; quote_or_summary: string }[]; provider: string; model: string | null; is_simulated: boolean;
  retrieval_trace: { query_terms?: string[]; candidates?: { card_id: string; title: string; score: number; matched_terms: string[]; reasons: string[] }[]; min_score?: number; note?: string };
  mentor_edited: boolean; updated_at: string; approved_at: string | null; rejected_at: string | null; rejection_reason: string | null; citations: Citation[];
}
interface Props {
  visit: { id: string; status: string; language: "en" | "hi"; grade: number; subject: string };
  observations: { id: string; practice_observed: string; evidence: string; tags: string[] }[];
  current: Draft | null;
  rejected: Draft[];
  cards: { id: string; title: string; domain: string; grades: string; subject: string }[];
  ai: { simulated: boolean; label: string; note: string; mode: string; configured: boolean };
}

// Language names are shown in their own script on purpose.
const LANG_LABEL = { hi: "हिन्दी", en: "English" } as const;

/** Remounts when the server sends a different draft, which resets local edit state without an effect. */
export function FeedbackWorkspace(props: Props) {
  return <FeedbackWorkspaceInner key={JSON.stringify(props.current)} {...props} />;
}

function FeedbackWorkspaceInner({ visit, observations, current, rejected, cards, ai }: Props) {
  const { t, tp, locale } = useI18n();
  const { run, pending, error } = useAction();
  const [lang, setLang] = useState<"en" | "hi">(current?.language ?? visit.language);
  const [preview, setPreview] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const editable = !!current && ["draft", "edited", "insufficient_evidence"].includes(current.status) && visit.status !== "completed";
  const canGenerate = ["in_progress", "pending_review"].includes(visit.status) && observations.length > 0 && current?.status !== "approved";

  const initial = useMemo(() => ({
    strength: current?.strength ?? "", priority_practice: current?.priority_practice ?? "", next_step: current?.next_step ?? "",
    ask_question: current?.ask_question ?? "", describe_statement: current?.describe_statement ?? "", ask_again_question: current?.ask_again_question ?? "",
    sources: current?.citations.map((c) => c.practice_card_id) ?? [],
  }), [current]);
  const [f, setF] = useState(initial);
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const [rejectReason, setRejectReason] = useState("");

  const generate = (opts: { language?: string; use_demo_provider?: boolean } = {}) =>
    run(() => api("POST", `/visits/${visit.id}/feedback`, opts, { idempotencyKey: newKey() }), { success: opts.use_demo_provider ? t("feedback.toast.simulated") : t("feedback.toast.created") });

  const save = () => run(() => api("PATCH", `/feedback/${current!.id}`, {
    strength: f.strength, priority_practice: f.priority_practice, next_step: f.next_step,
    ask_question: f.ask_question || undefined, describe_statement: f.describe_statement || undefined, ask_again_question: f.ask_again_question || undefined,
    citation_card_ids: f.sources.length ? f.sources : undefined,
    expected_updated_at: current!.updated_at, // refuse the save if another tab changed this card meanwhile
  }), { success: t("feedback.toast.saved") });

  async function approve() {
    if (dirty) { const ok = await save(); if (!ok) return; }
    await run(() => api("POST", `/feedback/${current!.id}/approve`), { success: t("feedback.toast.approved") });
  }

  const missingFields = editable && (!f.strength.trim() || !f.priority_practice.trim() || !f.next_step.trim());
  const noSource = editable && f.sources.length === 0;
  const feedbackLang = current?.language ?? lang;
  // The language name is bold inside the sentence: split the translated sentence around a marker.
  const [draftedPre, draftedPost = ""] = t("feedback.card.draftedIn", { lang: "\u0001" }).split("\u0001");

  // ---- nothing yet ---------------------------------------------------------------------------
  if (!current) {
    return (
      <div className="grid gap-6 grid-cols-[minmax(0,1fr)] lg:grid-cols-[1.5fr_1fr]">
        <Card className="p-6">
          <h2 className="text-lg font-semibold tracking-tight">{t("feedback.draft.title")}</h2>
          <p className="mt-1.5 max-w-xl text-sm text-ink-600">
            {t("feedback.draft.intro")}
          </p>
          <div className="mt-5 space-y-4">
            <Notice tone={ai.simulated ? "warning" : "info"} title={ai.simulated ? t("feedback.simulatedTitle") : ai.label}>{ai.simulated ? t("settings.ai.note.demo") : t("settings.ai.note.anthropic")}</Notice>
            {error && <GenerationError message={error.message} code={error.code} canFallback={!ai.simulated} onFallback={() => generate({ language: lang, use_demo_provider: true })} />}
            {observations.length === 0 && <Notice tone="warning" title={t("feedback.noObs.title")}>{t("feedback.noObs.body")}</Notice>}
            {!["in_progress", "pending_review"].includes(visit.status) && <Notice tone="warning">{t("feedback.startVisit")}</Notice>}
            <div className="flex flex-wrap items-end gap-3">
              <Field label={t("feedback.langLabel")} htmlFor="lang">
                <Select id="lang" value={lang} onChange={(e) => setLang(e.target.value as "en" | "hi")} className="w-44">
                  <option value="hi">हिन्दी (Hindi)</option><option value="en">English</option>
                </Select>
              </Field>
              <Button variant="accent" size="lg" disabled={!canGenerate || pending} onClick={() => generate({ language: lang })}>{pending ? t("feedback.drafting") : t("feedback.generate")}</Button>
            </div>
          </div>
        </Card>
        <EvidencePanel observations={observations} />
      </div>
    );
  }

  // ---- approved ------------------------------------------------------------------------------
  return (
    <div className="grid gap-6 grid-cols-[minmax(0,1fr)] lg:grid-cols-[1.5fr_1fr]">
      <div className="space-y-5">
        {current.status === "approved" && (
          <Notice tone="success" title={t("feedback.approved.title")}>
            {current.approved_at ? fmtDateTime(current.approved_at, locale) : ""} · {current.mentor_edited ? t("feedback.approved.edited") : t("feedback.approved.unedited")}.{" "}
            {t("feedback.approved.next")} <Link className="underline" href={`/visits/${visit.id}/demonstrate`}>{t("feedback.approved.linkDemo")}</Link>{t("feedback.approved.then")} <Link className="underline" href={`/visits/${visit.id}/report`}>{t("feedback.approved.linkCommit")}</Link>.
          </Notice>
        )}
        {current.status === "insufficient_evidence" && (
          <Notice tone="warning" title={t("feedback.insufficient.title")}>
            {t("feedback.insufficient.body", { grade: visit.grade, subject: visit.subject })}
          </Notice>
        )}
        {current.language === "hi" && current.citations.some((c) => c.origin === "official_source") && (
          <Notice tone="warning" title={t("feedback.hiOfficial.title")}>
            {t("feedback.hiOfficial.body")}
          </Notice>
        )}
        {error && <GenerationError message={error.message} code={error.code} canFallback={!ai.simulated && error.code.startsWith("ai_")} onFallback={() => generate({ language: lang, use_demo_provider: true })} />}

        <Card>
          <CardHeader
            title={t("feedback.card.title")}
            description={t("feedback.card.description")}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <FeedbackChip status={current.status} />
                {current.is_simulated ? <SimulatedBadge /> : current.provider !== "retrieval" ? <AiDraftBadge model={current.model} /> : null}
              </div>
            }
          />
          {current.status !== "approved" && current.status !== "rejected" && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-ink-50/70 px-5 py-2.5 text-[13px] text-ink-600">
              <span>{draftedPre}<strong>{LANG_LABEL[current.language]}</strong>{draftedPost}</span>
              <button type="button" className="inline-flex items-center gap-1.5 font-medium text-ink-800 hover:underline" onClick={() => setPreview((p) => !p)}>
                {preview ? <><EyeOff size={14} aria-hidden /> {t("feedback.card.edit")}</> : <><Eye size={14} aria-hidden /> {t("feedback.card.preview")}</>}
              </button>
            </div>
          )}

          {(!editable || preview) ? (
            <CardPreview f={editable ? f : initial} lang={feedbackLang} citations={current.citations} />
          ) : (
            <div className="space-y-5 p-5">
              <Field label={t("feedback.field.strength")} htmlFor="strength" required hint={t("feedback.field.strengthHint")}>
                <Textarea id="strength" lang={feedbackLang} value={f.strength} onChange={(e) => setF({ ...f, strength: e.target.value })} maxLength={600} />
              </Field>
              <Field label={t("feedback.field.priority")} htmlFor="priority" required hint={t("feedback.field.priorityHint")}>
                <Textarea id="priority" lang={feedbackLang} value={f.priority_practice} onChange={(e) => setF({ ...f, priority_practice: e.target.value })} maxLength={600} />
              </Field>
              <Field label={t("feedback.field.next")} htmlFor="next" required hint={t("feedback.field.nextHint")}>
                <Textarea id="next" lang={feedbackLang} value={f.next_step} onChange={(e) => setF({ ...f, next_step: e.target.value })} maxLength={500} />
              </Field>
              <fieldset className="space-y-4 rounded-lg border border-line p-4">
                <legend className="px-1 text-sm font-semibold">{t("feedback.ada.legend")}</legend>
                <Field label={t("feedback.ada.ask")} htmlFor="ask"><Textarea id="ask" lang={feedbackLang} value={f.ask_question} onChange={(e) => setF({ ...f, ask_question: e.target.value })} className="min-h-[64px]" /></Field>
                <Field label={t("feedback.ada.describe")} htmlFor="describe"><Textarea id="describe" lang={feedbackLang} value={f.describe_statement} onChange={(e) => setF({ ...f, describe_statement: e.target.value })} className="min-h-[64px]" /></Field>
                <Field label={t("feedback.ada.askAgain")} htmlFor="askagain"><Textarea id="askagain" lang={feedbackLang} value={f.ask_again_question} onChange={(e) => setF({ ...f, ask_again_question: e.target.value })} className="min-h-[64px]" /></Field>
              </fieldset>
            </div>
          )}

          {editable && (
            <div className="space-y-3 border-t border-line px-5 py-4">
              {missingFields && <p className="text-[13px] text-red-700" role="alert">{t("feedback.err.missingFields")}</p>}
              {noSource && <p className="text-[13px] text-red-700" role="alert">{t("feedback.err.noSource")}</p>}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <ConfirmButton
                    variant="secondary" label={<><RefreshCw size={15} aria-hidden /> {t("feedback.regen.label")}</>} title={t("feedback.regen.title")} confirmLabel={t("feedback.regen.confirm")}
                    description={t("feedback.regen.description")}
                    disabled={!canGenerate || pending}
                    onConfirm={() => void generate({ language: lang })}
                  />
                  <Select aria-label={t("feedback.regenLangAria")} value={lang} onChange={(e) => setLang(e.target.value as "en" | "hi")} className="h-10 w-36"><option value="hi">हिन्दी</option><option value="en">English</option></Select>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ConfirmButton
                    variant="danger" label={t("common.reject")} title={t("feedback.reject.title")} confirmLabel={t("feedback.reject.confirm")} disabled={pending}
                    description={t("feedback.reject.description")}
                    // The default reason is what is saved in the audit record, so it stays as the API expects it.
                    onConfirm={async () => { await run(() => api("POST", `/feedback/${current.id}/reject`, { reason: rejectReason || "Not suitable for this classroom" }), { success: t("feedback.toast.rejected") }); }}
                  >
                    <div className="mt-3"><Field label={t("feedback.reject.reason")} htmlFor="rj"><Textarea id="rj" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} className="min-h-[60px]" placeholder={t("feedback.reject.placeholder")} /></Field></div>
                  </ConfirmButton>
                  <Button variant="secondary" disabled={!dirty || pending} onClick={save}>{t("feedback.saveChanges")}</Button>
                  <ConfirmButton
                    variant="accent" label={<><ShieldCheck size={15} aria-hidden /> {t("common.approve")}</>} title={t("feedback.approve.title")} confirmLabel={t("common.approve")}
                    description={t("feedback.approve.description")}
                    disabled={pending || missingFields || noSource}
                    onConfirm={approve}
                  />
                </div>
              </div>
            </div>
          )}
        </Card>

        {rejected.length > 0 && (
          <p className="text-[13px] text-ink-600">{tp("feedback.rejectedEarlier", rejected.length)}</p>
        )}
      </div>

      <div className="space-y-5">
        <SourcesPanel citations={current.citations} selected={f.sources} editable={editable} cards={cards} onChange={(s) => setF({ ...f, sources: s })} />
        <EvidencePanel observations={observations} used={current.evidence} />
        <Card>
          <button type="button" className="flex w-full items-center justify-between px-5 py-3.5 text-left text-sm font-semibold" aria-expanded={showWhy} onClick={() => setShowWhy((s) => !s)}>
            {t("feedback.trace.title")}<span className="text-ink-500">{showWhy ? "−" : "+"}</span>
          </button>
          {showWhy && (
            <div className="space-y-3 border-t border-line px-5 py-4 text-[13px]">
              {current.retrieval_trace.candidates?.length ? current.retrieval_trace.candidates.map((c, i) => (
                <div key={c.card_id}>
                  <p className="font-medium">{i + 1}. <span className="font-mono">{c.card_id}</span> · {c.title} <span className="text-ink-600">{t("feedback.trace.relevance", { score: c.score })}</span></p>
                  <ul className="mt-1 list-disc pl-5 text-ink-600">{c.reasons.map((r, j) => <li key={j}>{r}</li>)}</ul>
                </div>
              )) : <p className="text-ink-600">{current.retrieval_trace.note ?? t("feedback.trace.none")}</p>}
              <p className="text-ink-600">{t("feedback.trace.note", { provider: current.is_simulated ? t("feedback.trace.demoProvider") : `${current.provider}${current.model ? ` · ${current.model}` : ""}` })}</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function GenerationError({ message, code, canFallback, onFallback }: { message: string; code: string; canFallback: boolean; onFallback: () => void }) {
  const { t } = useI18n();
  return (
    <Notice tone="error" title={t("feedback.genError.title")}>
      <p>{message}</p>
      <p className="mt-1 text-[13px] opacity-80">{t("feedback.genError.nothingSaved", { code })}</p>
      {canFallback && <Button className="mt-3" size="sm" variant="secondary" onClick={onFallback}>{t("feedback.genError.useSimulated")}</Button>}
    </Notice>
  );
}

function PreviewRow({ label, tone, text, lang }: { label: string; tone: string; text: string; lang: "en" | "hi" }) {
  return (
    <div className="space-y-1">
      <p className={`text-[12px] font-semibold uppercase tracking-wide ${tone}`}>{label}</p>
      <p className="text-[15px] leading-relaxed" lang={lang}>{text || "—"}</p>
    </div>
  );
}

function CardPreview({ f, lang, citations }: { f: { strength: string; priority_practice: string; next_step: string; ask_question: string; describe_statement: string; ask_again_question: string }; lang: "en" | "hi"; citations: Citation[] }) {
  const { t } = useI18n();
  return (
    <div className="space-y-5 p-5">
      <PreviewRow label={t("feedback.preview.strength")} tone="text-teal-700" text={f.strength} lang={lang} />
      <PreviewRow label={t("feedback.preview.priority")} tone="text-amber-800" text={f.priority_practice} lang={lang} />
      <PreviewRow label={t("feedback.preview.next")} tone="text-ink-900" text={f.next_step} lang={lang} />
      <div className="rounded-lg border border-line bg-ink-50/60 p-4">
        <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-600">{t("feedback.ada.legend")}</p>
        <ol className="space-y-2.5 text-sm" lang={lang}>
          <li><strong>{t("feedback.preview.ask")}</strong> {f.ask_question || "—"}</li>
          <li><strong>{t("feedback.preview.describe")}</strong> {f.describe_statement || "—"}</li>
          <li><strong>{t("feedback.preview.ask")}</strong> {f.ask_again_question || "—"}</li>
        </ol>
      </div>
      <p className="text-[13px] text-ink-600">{t("feedback.preview.source", { sources: citations.map((c) => `${c.practice_card_id} (${c.source_title})`).join("; ") || t("feedback.preview.noneSelected") })}</p>
    </div>
  );
}

function SourcesPanel({ citations, selected, editable, cards, onChange }: { citations: Citation[]; selected: string[]; editable: boolean; cards: Props["cards"]; onChange: (s: string[]) => void }) {
  const { t } = useI18n();
  const byId = new Map(citations.map((c) => [c.practice_card_id, c]));
  return (
    <Card>
      <CardHeader title={t("feedback.src.title")} description={t("feedback.src.description")} action={<BookMarked size={16} className="text-ink-500" aria-hidden />} />
      <div className="space-y-4 p-5">
        {citations.length === 0 && <p className="text-sm text-ink-600">{t("feedback.src.none")}</p>}
        {citations.map((c) => (
          <div key={c.practice_card_id} className="rounded-lg border border-line p-3.5 text-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium"><span className="font-mono text-[13px]">{c.practice_card_id}</span> {c.is_primary && <Chip tone="teal">{t("feedback.src.primary")}</Chip>}</p>
              <Chip tone="neutral">v{c.card_version}</Chip>
            </div>
            <p className="mt-1.5 flex flex-wrap items-center gap-2 text-ink-700"><OriginBadge origin={c.origin} /></p>
            <p className="mt-1.5 text-ink-700">{c.source_title}{c.source_section ? ` · ${c.source_section}` : ""}</p>
            {c.chunks.map((k) => (
              <blockquote key={k.chunk_id} className="mt-2 border-l-2 border-ink-600 pl-3 text-[13px] italic text-ink-800">
                “{k.excerpt}”
                <span className="mt-1 block not-italic text-[12px] text-ink-600">{t("feedback.src.excerpt", { printed: k.printed_page ?? "?", pdf: k.pdf_page, chunk: k.chunk_id })}</span>
              </blockquote>
            ))}
            {c.origin === "illustrative" && <p className="mt-1.5 text-[12px] text-amber-800">{t("feedback.src.illustrative")}</p>}
            {c.relevance_reason && <p className="mt-1 text-[13px] text-ink-600">{t("feedback.src.why", { reason: c.relevance_reason })}</p>}
            <LinkButton href={`/practice-library/${c.practice_card_id}`} variant="ghost" size="sm" className="mt-2 -ml-2">{t("feedback.src.inspect")}</LinkButton>
          </div>
        ))}
        {editable && (
          <Field label={t("feedback.src.changeLabel")} htmlFor="src" hint={t("feedback.src.changeHint")}>
            <Select
              id="src" value="" onChange={(e) => { const v = e.target.value; if (v && !selected.includes(v)) onChange([...selected, v].slice(0, 3)); }}>
              <option value="">{t("feedback.src.addOption")}</option>
              {cards.filter((c) => !selected.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{t("feedback.src.optionLabel", { id: c.id, title: c.title, grades: c.grades, subject: c.subject })}</option>)}
            </Select>
          </Field>
        )}
        {editable && selected.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label={t("feedback.src.selectedAria")}>
            {selected.map((id, i) => (
              <li key={id}>
                <Chip tone={i === 0 ? "teal" : "neutral"}>
                  <span className="font-mono">{id}</span>{i === 0 ? ` · ${t("feedback.src.primarySuffix")}` : ""}
                  <button type="button" aria-label={t("feedback.src.removeAria", { id })} className="ml-1 text-ink-600 hover:text-ink-900" onClick={() => onChange(selected.filter((s) => s !== id))}>×</button>
                </Chip>
              </li>
            ))}
          </ul>
        )}
        {editable && selected.some((s) => !byId.has(s)) && <p className="text-[13px] text-amber-800">{t("feedback.src.unsaved")}</p>}
      </div>
    </Card>
  );
}

function EvidencePanel({ observations, used }: { observations: { id: string; practice_observed: string; evidence: string; tags: string[] }[]; used?: { observation_id: string; quote_or_summary: string }[] }) {
  const { t } = useI18n();
  const usedIds = new Set(used?.map((u) => u.observation_id));
  return (
    <Card>
      <CardHeader title={t("feedback.evidence.title")} description={t("feedback.evidence.description")} action={<Link className="text-[13px] underline" href="./observe">{t("feedback.evidence.edit")}</Link>} />
      {observations.length === 0 ? <p className="p-5 text-sm text-ink-600">{t("feedback.evidence.none")}</p> : (
        <ul className="divide-y divide-line">
          {observations.map((o) => (
            <li key={o.id} className="space-y-1.5 px-5 py-3.5 text-[13px]">
              <p className="font-medium text-ink-900">{o.practice_observed} {usedIds.has(o.id) && <Chip tone="teal" className="ml-1">{t("feedback.evidence.used")}</Chip>}</p>
              <p className="text-ink-700">{o.evidence}</p>
              {o.tags.length > 0 && <p className="flex flex-wrap gap-1">{o.tags.map((tag) => <Chip key={tag} tone="neutral">{tag}</Chip>)}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
