"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Lightbulb, Pencil, Plus, Trash2, X } from "lucide-react";
import { api, newKey } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { Button, Card, CardHeader, Chip, LinkButton, Notice } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm";
import { Field, Select, Textarea } from "@/components/forms";
import { useI18n } from "@/lib/i18n/client";
import { useUnsavedWarning } from "@/lib/client/use-unsaved-warning";
import { visitStatusKey } from "@/lib/format";

interface Tag { code: string; label: string; domain: string; source: "mentor" | "suggested"; confirmed: boolean; match_strength: number | null; matched_terms: string[] }
interface Obs { id: string; updated_at: string; practice_observed: string; evidence: string; worked_well: string | null; improvement_area: string | null; context_note: string | null; tags: Tag[] }

const EVALUATIVE = /\b(lazy|weak teacher|bad teacher|poor teacher|incompetent|useless|careless)\b/i;
// \b does not work with Devanagari, so Hindi judging words are matched separately.
const EVALUATIVE_HI = /(आलसी|निकम्मा|निकम्मी|नकारा|बेकार टीचर|बेकार शिक्षक|कमज़ोर शिक्षक|कमजोर शिक्षक|लापरवाह|अयोग्य)/;

function ObservationForm({ visitId, initial, onDone, onCancel }: { visitId: string; initial?: Obs; onDone: () => void; onCancel?: () => void }) {
  const { t } = useI18n();
  const { run, pending, error } = useAction();
  const [v, setV] = useState({
    practice_observed: initial?.practice_observed ?? "", evidence: initial?.evidence ?? "", worked_well: initial?.worked_well ?? "",
    improvement_area: initial?.improvement_area ?? "", context_note: initial?.context_note ?? "",
  });
  const submitKey = useRef(newKey()); // a double-click on Save must not record the observation twice
  const f = error?.fields ?? {};

  // Unsaved text is kept in memory only (never in browser storage: observations can be sensitive); the browser asks before the
  // page is closed or reloaded while there are unsaved changes.
  const dirty = Object.values(v).some(Boolean) && !initial;
  useUnsavedWarning(dirty);

  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLTextAreaElement>) => setV((x) => ({ ...x, [k]: e.target.value }));
  const allText = Object.values(v).join(" ");
  const flagged = EVALUATIVE.test(allText) || EVALUATIVE_HI.test(allText);

  async function submit() {
    const res = await run(() => (initial ? api("PATCH", `/observations/${initial.id}`, { ...v, expected_updated_at: initial.updated_at }) : api("POST", `/visits/${visitId}/observations`, v, { idempotencyKey: submitKey.current })), {
      success: initial ? t("observe.updated") : t("observe.saved"),
    });
    if (res) {
      if (!initial) { setV({ practice_observed: "", evidence: "", worked_well: "", improvement_area: "", context_note: "" }); submitKey.current = newKey(); }
      onDone();
    }
  }

  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-4 p-5">
      <Field label={t("observe.practice")} htmlFor={`po-${initial?.id ?? "n"}`} required error={f.practice_observed} hint={t("observe.practiceHint")}>
        <Textarea id={`po-${initial?.id ?? "n"}`} value={v.practice_observed} onChange={set("practice_observed")} maxLength={1500} error={f.practice_observed} />
      </Field>
      <Field label={t("observe.evidence")} htmlFor={`ev-${initial?.id ?? "n"}`} required error={f.evidence} hint={t("observe.evidenceHint")}>
        <Textarea id={`ev-${initial?.id ?? "n"}`} value={v.evidence} onChange={set("evidence")} maxLength={2000} error={f.evidence} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("observe.workedWell")} htmlFor={`ww-${initial?.id ?? "n"}`} error={f.worked_well}>
          <Textarea id={`ww-${initial?.id ?? "n"}`} value={v.worked_well} onChange={set("worked_well")} maxLength={1500} className="min-h-[72px]" />
        </Field>
        <Field label={t("observe.grow")} htmlFor={`ia-${initial?.id ?? "n"}`} error={f.improvement_area} hint={t("observe.growHint")}>
          <Textarea id={`ia-${initial?.id ?? "n"}`} value={v.improvement_area} onChange={set("improvement_area")} maxLength={1500} className="min-h-[72px]" />
        </Field>
      </div>
      <Field label={t("observe.context")} htmlFor={`cn-${initial?.id ?? "n"}`} error={f.context_note}>
        <Textarea id={`cn-${initial?.id ?? "n"}`} value={v.context_note} onChange={set("context_note")} maxLength={500} className="min-h-[56px]" placeholder={t("observe.contextPlaceholder")} />
      </Field>
      {flagged && <Notice tone="warning" title={t("observe.flaggedTitle")}>{t("observe.flaggedBody")}</Notice>}
      {error && !error.fields && <Notice tone="error">{error.message}</Notice>}
      <div className="flex justify-end gap-2">
        {onCancel && <Button variant="secondary" onClick={onCancel}>{t("common.cancel")}</Button>}
        <Button type="submit" variant="accent" disabled={pending}>{pending ? t("common.saving") : initial ? t("observe.saveChanges") : t("observe.saveObservation")}</Button>
      </div>
    </form>
  );
}

function TagRow({ obs, rubric, locked }: { obs: Obs; rubric: { code: string; label: string; domain: string }[]; locked: boolean }) {
  const { t } = useI18n();
  const { run, pending } = useAction();
  const decide = (body: object, ok: string) => run(() => api("POST", `/observations/${obs.id}/tags`, body), { success: ok });
  const have = new Set(obs.tags.map((t) => t.code));
  const confirmed = obs.tags.filter((t) => t.confirmed);
  const suggested = obs.tags.filter((t) => !t.confirmed);
  return (
    <div className="space-y-2 border-t border-line pt-3">
      <p className="text-[13px] font-medium text-ink-700">{t("observe.tags")}</p>
      <div className="flex flex-wrap gap-1.5">
        {confirmed.length === 0 && suggested.length === 0 && <span className="text-[13px] text-ink-600">{t("observe.noTags")}</span>}
        {confirmed.map((g) => (
          <Chip key={g.code} tone="teal"><Check size={12} aria-hidden /> {g.label}</Chip>
        ))}
      </div>
      {suggested.length > 0 && (
        <ul className="space-y-1.5">
          {suggested.map((g) => (
            <li key={g.code}className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-line-strong bg-ink-50/60 px-3 py-2 text-[13px]">
              <Lightbulb size={14} className="text-amber-600" aria-hidden />
              <span><strong>{g.label}</strong><span className="text-ink-600">{t("observe.suggestedMeta", { terms: g.matched_terms.slice(0, 3).map((x) => `“${x}”`).join(", ") })}</span></span>
              {!locked && (
                <span className="ml-auto flex gap-1.5">
                  <Button size="sm" variant="secondary" disabled={pending} onClick={() => decide({ confirm: [g.code] }, t("observe.tagConfirmed"))}>{t("observe.confirm")}</Button>
                  <Button size="sm" variant="ghost" disabled={pending} aria-label={t("observe.dismissAria", { label: g.label })} onClick={() => decide({ dismiss: [g.code] }, t("observe.dismissed"))}><X size={14} /></Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {!locked && (
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor={`add-${obs.id}`}>{t("observe.addTagLabel")}</label>
          <Select id={`add-${obs.id}`} className="h-8 max-w-xs text-[13px]" defaultValue="" onChange={(e) => { if (e.target.value) { void decide({ add: [e.target.value] }, t("observe.tagAdded")); e.target.value = ""; } }}>
            <option value="">{t("observe.addTagOption")}</option>
            {rubric.filter((r) => !have.has(r.code)).map((r) => <option key={r.code} value={r.code}>{r.domain}: {r.label}</option>)}
          </Select>
        </div>
      )}
    </div>
  );
}

export function ObservationManager({
  visitId, status, observations, rubric, locked, lockReason,
}: { visitId: string; status: string; observations: Obs[]; rubric: { code: string; label: string; domain: string }[]; locked: boolean; lockReason: string | null }) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { run, pending } = useAction();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(observations.length === 0);
  const notStarted = status === "draft" || status === "planned";

  if (notStarted) {
    return (
      <Notice tone="info" title={t("observe.startTitle")}>
        <p className="mb-3">{t("observe.startBody", { status: t(visitStatusKey(status)).toLocaleLowerCase(locale) })}</p>
        <Button variant="accent" disabled={pending} onClick={() => run(() => api("POST", `/visits/${visitId}/transition`, { to: status === "draft" ? "planned" : "in_progress" }), { success: status === "draft" ? t("visits.action.planned") : t("visits.actions.started") })}>
          {status === "draft" ? t("observe.planFirst") : t("visits.actions.start")}
        </Button>
      </Notice>
    );
  }

  return (
    <div className="grid gap-6 grid-cols-[minmax(0,1fr)] lg:grid-cols-[1.5fr_1fr]">
      <div className="space-y-5">
        {lockReason && <Notice tone="warning" title={t("observe.readOnly")}>{lockReason}</Notice>}
        {observations.map((o) => (
          <Card key={o.id}>
            {editing === o.id ? (
              <ObservationForm visitId={visitId} initial={o} onDone={() => setEditing(null)} onCancel={() => setEditing(null)} />
            ) : (
              <div className="space-y-3 p-5 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold">{o.practice_observed}</h3>
                  {!locked && (
                    <div className="flex shrink-0 gap-1">
                      <Button size="sm" variant="ghost" aria-label={t("observe.editAria")} onClick={() => setEditing(o.id)}><Pencil size={14} /></Button>
                      <ConfirmButton size="sm" variant="ghost" label={<Trash2 size={14} aria-label={t("observe.deleteAria")} />} title={t("observe.deleteTitle")} description={t("observe.deleteDesc")} confirmLabel={t("common.delete")} onConfirm={() => void run(() => api("DELETE", `/observations/${o.id}`), { success: t("observe.deleted") })} />
                    </div>
                  )}
                </div>
                <p><span className="text-ink-600">{t("observe.evidenceLabel")}</span> {o.evidence}</p>
                {o.worked_well && <p><span className="font-medium text-teal-700">{t("observe.workedWellLabel")}</span> {o.worked_well}</p>}
                {o.improvement_area && <p><span className="font-medium text-amber-800">{t("observe.areaLabel")}</span> {o.improvement_area}</p>}
                {o.context_note && <p className="text-[13px] text-ink-600">{t("observe.contextLabel")} {o.context_note}</p>}
                <TagRow obs={o} rubric={rubric} locked={locked} />
              </div>
            )}
          </Card>
        ))}

        {!locked && (adding || observations.length === 0 ? (
          <Card>
            <CardHeader title={observations.length === 0 ? t("observe.firstTitle") : t("observe.anotherTitle")} description={t("observe.savedDesc")} />
            <ObservationForm visitId={visitId} onDone={() => { setAdding(false); router.refresh(); }} onCancel={observations.length ? () => setAdding(false) : undefined} />
          </Card>
        ) : (
          <Button variant="secondary" onClick={() => setAdding(true)}><Plus size={16} aria-hidden /> {t("observe.anotherTitle")}</Button>
        ))}
      </div>

      <aside className="space-y-4">
        <Card className="p-5">
          <h2 className="text-[15px] font-semibold">{t("observe.tipsTitle")}</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[13px] text-ink-700">
            <li>{t("observe.tip1Pre")}<strong>{t("observe.tip1Strong")}</strong>{t("observe.tip1Post")}</li>
            <li>{t("observe.tip2")}</li>
            <li>{t("observe.tip3")}</li>
            <li>{t("observe.tip4")}</li>
          </ul>
        </Card>
        <Card className="space-y-3 p-5">
          <h2 className="text-[15px] font-semibold">{t("observe.nextTitle")}</h2>
          <p className="text-[13px] text-ink-600">{observations.length === 0 ? t("observe.nextNone") : t("observe.nextReady")}</p>
          <LinkButton href={`/visits/${visitId}/feedback`} variant={observations.length ? "accent" : "secondary"} className="w-full">{t("observe.goFeedback")}</LinkButton>
        </Card>
      </aside>
    </div>
  );
}
