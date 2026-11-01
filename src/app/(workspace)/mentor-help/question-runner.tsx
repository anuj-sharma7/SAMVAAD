"use client";

import { useState } from "react";
import { Copy, Lightbulb, Loader2, Sparkles, Wand2 } from "lucide-react";
import { api, ApiError } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";
import { useToast } from "@/components/toast";
import { Button, Card, CardHeader, Chip, Notice, cn } from "@/components/ui";
import { Field, Select, Textarea } from "@/components/forms";
import { SimulatedBadge } from "@/components/ui-i18n";
import { PrintButton } from "@/components/print-button";
import { GROUND_TOPICS, HELP_GRADES, MEAL_TOPICS, subjectsForGrade, type HelpSubject, type Outcome } from "@/lib/help/catalog";
import { questionSetText } from "@/lib/help/share-text";
import type { HelpSession } from "@/lib/services/mentor-help";

export interface RecentSet { id: string; kind: string; grade: number | null; subject: string | null; topic: string | null; reviewed: boolean; created_at: string }

const OUTCOME_TONE: Record<Outcome, string> = {
  good: "border-teal-600 bg-teal-50 text-teal-700",
  some: "border-amber-700 bg-amber-50 text-amber-800",
  weak: "border-red-600 bg-red-50 text-red-700",
};

/** Question generator + tap-to-answer + AI review. `mode` picks the form: class/subject, or mid-day meal / school ground topic. */
export function QuestionRunner({ mode, initial, recent, defaults, keepQuery = "" }: { mode: "subject" | "place"; initial: HelpSession | null; recent: RecentSet[]; defaults?: { grade?: number; subject?: HelpSubject }; keepQuery?: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const [grade, setGrade] = useState(initial?.grade ?? defaults?.grade ?? 3);
  const [subject, setSubject] = useState<HelpSubject>((initial?.subject as HelpSubject) ?? defaults?.subject ?? "Hindi");
  const [topic, setTopic] = useState<string>(initial?.topic ?? "menu");
  const [count, setCount] = useState(5);
  const [session, setSession] = useState<HelpSession | null>(initial);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>(initial?.outcomes ?? {});
  const [note, setNote] = useState(initial?.note ?? "");
  const [busy, setBusy] = useState<"gen" | "review" | null>(null);
  const [error, setError] = useState("");

  const subjects = subjectsForGrade(grade);
  const kindOfTopic = (MEAL_TOPICS as readonly string[]).includes(topic) ? "meal" : "ground";
  const oPrefix = mode === "subject" ? "mhelp.q.o." : "mhelp.meal.o.";

  async function generate() {
    setBusy("gen");
    setError("");
    try {
      const body = mode === "subject" ? { kind: "subject", grade, subject, count } : { kind: kindOfTopic, topic, count };
      const s = await api<HelpSession>("POST", "/help/sessions", body);
      setSession(s);
      setOutcomes({});
      setNote("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function review() {
    if (!session) return;
    if (Object.keys(outcomes).length === 0) { setError(t("mhelp.q.tapFirst")); return; }
    setBusy("review");
    setError("");
    try {
      const s = await api<HelpSession>("POST", `/help/sessions/${session.id}/review`, { outcomes, note });
      setSession(s);
      toast.success(t("mhelp.q.reviewTitle"));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  /** Puts the questions on the clipboard as plain text, to paste into WhatsApp or a notes app. */
  async function copyText() {
    if (!session) return;
    const title = session.kind === "subject" ? `${t("mhelp.classN", { n: session.grade ?? 0 })} · ${t(`mhelp.subject.${session.subject}`)}` : t(`mhelp.meal.t.${session.topic}`);
    const who = Object.fromEntries(["students", "cook", "teacher", "head", "smc"].map((w) => [w, t(`mhelp.q.who.${w}`)]));
    const text = questionSetText(title, session.tip, session.questions, { who, hint: t("mhelp.q.hint"), tip: t("mhelp.q.tip") });
    try { await navigator.clipboard.writeText(text); toast.success(t("mhelp.q.copied")); } catch { toast.error(t("mhelp.q.copyFailed")); }
  }

  const labelOf = (r: RecentSet) =>
    r.kind === "subject" ? `${t("mhelp.classN", { n: r.grade ?? 0 })} · ${t(`mhelp.subject.${r.subject}`)}` : t(`mhelp.meal.t.${r.topic}`);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      <div className="no-print space-y-6">
        <Card>
          <CardHeader title={mode === "subject" ? t("mhelp.q.title") : t("mhelp.meal.title")} />
          <form className="space-y-4 px-5 py-5" onSubmit={(e) => { e.preventDefault(); void generate(); }}>
            {mode === "subject" ? (
              <>
                <Field label={t("mhelp.q.class")} htmlFor="mh-class">
                  <Select id="mh-class" value={grade} onChange={(e) => {
                    const g = Number(e.target.value);
                    setGrade(g);
                    if (!subjectsForGrade(g).includes(subject)) setSubject("Hindi");
                  }}>
                    {HELP_GRADES.map((g) => <option key={g} value={g}>{t("mhelp.classN", { n: g })}</option>)}
                  </Select>
                </Field>
                <Field label={t("mhelp.q.subject")} htmlFor="mh-subject">
                  <Select id="mh-subject" value={subject} onChange={(e) => setSubject(e.target.value as HelpSubject)}>
                    {subjects.map((s) => <option key={s} value={s}>{t(`mhelp.subject.${s}`)}</option>)}
                  </Select>
                </Field>
              </>
            ) : (
              <Field label={t("mhelp.meal.topic")} htmlFor="mh-topic">
                <Select id="mh-topic" value={topic} onChange={(e) => setTopic(e.target.value)}>
                  <optgroup label={t("mhelp.meal.group.meal")}>
                    {MEAL_TOPICS.map((x) => <option key={x} value={x}>{t(`mhelp.meal.t.${x}`)}</option>)}
                  </optgroup>
                  <optgroup label={t("mhelp.meal.group.ground")}>
                    {GROUND_TOPICS.map((x) => <option key={x} value={x}>{t(`mhelp.meal.t.${x}`)}</option>)}
                  </optgroup>
                </Select>
              </Field>
            )}
            <Field label={t("mhelp.q.count")} htmlFor="mh-count">
              <Select id="mh-count" value={count} onChange={(e) => setCount(Number(e.target.value))}>
                {[3, 5, 8].map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </Field>
            <Button type="submit" variant="accent" className="w-full" disabled={busy !== null}>
              {busy === "gen" ? <><Loader2 size={16} className="animate-spin" aria-hidden /> {t("mhelp.q.generating")}</> : <><Wand2 size={16} aria-hidden /> {t("mhelp.q.generate")}</>}
            </Button>
          </form>
        </Card>

        <Card>
          <CardHeader title={t("mhelp.q.recent")} />
          {recent.length === 0 ? (
            <p className="px-5 py-5 text-sm text-ink-600">{t("mhelp.q.recentEmpty")}</p>
          ) : (
            <ul className="divide-y divide-line">
              {recent.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium">{labelOf(r)}</span>
                  {r.reviewed && <Chip tone="teal">{t("mhelp.q.reviewed")}</Chip>}
                  <a className="text-teal-700 underline" href={`?s=${r.id}${keepQuery}`}>{t("mhelp.q.open")}</a>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="space-y-4" aria-live="polite">
        {error && <Notice tone="error">{error}</Notice>}
        {!session && !error && <Notice tone="info">{t("mhelp.aiNote")}</Notice>}
        {session && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {session.is_simulated ? <SimulatedBadge /> : <Chip tone="neutral"><Sparkles size={12} aria-hidden /> AI · {session.model}</Chip>}
              <p className="text-sm font-medium">
                {session.kind === "subject" ? `${t("mhelp.classN", { n: session.grade ?? 0 })} · ${t(`mhelp.subject.${session.subject}`)}` : t(`mhelp.meal.t.${session.topic}`)}
              </p>
            </div>
            {session.is_simulated && <Notice tone="warning">{t("mhelp.simNote")}</Notice>}
            {session.tip && <p className="flex items-start gap-2 text-sm text-ink-700"><Lightbulb size={16} className="mt-0.5 shrink-0 text-amber-700" aria-hidden /> <span><strong>{t("mhelp.q.tip")}:</strong> {session.tip}</span></p>}

            <div className="no-print flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => void copyText()}><Copy size={14} aria-hidden /> {t("mhelp.q.copy")}</Button>
              <PrintButton label={t("mhelp.q.print")} />
            </div>

            <ol className="space-y-3">
              {session.questions.map((q, idx) => {
                const picked = outcomes[String(idx)];
                return (
                  <li key={idx}>
                    <Card className="p-4">
                      <p className="text-[12px] font-medium uppercase tracking-wide text-ink-600">{idx + 1}. {t(`mhelp.q.who.${q.who}`)}</p>
                      <p lang="hi" className="mt-1 text-[16px] font-medium leading-snug">{q.q}</p>
                      {q.hint && <p className="mt-1.5 text-[13px] text-ink-600"><strong>{t("mhelp.q.hint")}:</strong> {q.hint}</p>}
                      <div role="group" aria-label={t("mhelp.q.howWent")} className="mt-3 flex flex-wrap gap-2">
                        {(["good", "some", "weak"] as const).map((o) => (
                          <button
                            key={o}
                            type="button"
                            aria-pressed={picked === o}
                            onClick={() => setOutcomes((cur) => (cur[String(idx)] === o ? Object.fromEntries(Object.entries(cur).filter(([k]) => k !== String(idx))) as Record<string, Outcome> : { ...cur, [String(idx)]: o }))}
                            className={cn("min-h-11 rounded-lg border px-3.5 text-sm font-medium transition-colors", picked === o ? OUTCOME_TONE[o] : "border-line-strong bg-card text-ink-900 hover:bg-ink-50")}
                          >
                            {t(`${oPrefix}${o}`)}
                          </button>
                        ))}
                      </div>
                      {(picked === "some" || picked === "weak") && q.fix && (
                        <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
                          <Lightbulb size={15} className="mt-0.5 shrink-0" aria-hidden /> <span><strong>{t("mhelp.q.fix")}:</strong> {q.fix}</span>
                        </p>
                      )}
                    </Card>
                  </li>
                );
              })}
            </ol>

            <Card className="space-y-3 p-4">
              <Field label={t("mhelp.q.note")} hint={t("mhelp.q.noteHint")} htmlFor="mh-note">
                <Textarea id="mh-note" value={note} maxLength={600} onChange={(e) => setNote(e.target.value)} />
              </Field>
              <Button type="button" variant="accent" onClick={() => void review()} disabled={busy !== null}>
                {busy === "review" ? <><Loader2 size={16} className="animate-spin" aria-hidden /> {t("mhelp.q.reviewing")}</> : <><Sparkles size={16} aria-hidden /> {t("mhelp.q.review")}</>}
              </Button>
            </Card>

            {session.review && (
              <Card className="space-y-3 p-5">
                <h2 className="text-lg font-semibold">{t("mhelp.q.reviewTitle")}</h2>
                <p lang="hi">{session.review.summary}</p>
                <div>
                  <h3 className="text-sm font-semibold">{t("mhelp.q.suggestions")}</h3>
                  <ul className="mt-1.5 list-disc space-y-1.5 pl-5 text-sm">
                    {session.review.suggestions.map((s, i) => (
                      <li key={i} lang="hi">{s.q && <span className="text-ink-600">{s.q} → </span>}{s.text}</li>
                    ))}
                  </ul>
                </div>
                <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm" lang="hi"><strong>{t("mhelp.q.nextStep")}:</strong> {session.review.next_step}</p>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
