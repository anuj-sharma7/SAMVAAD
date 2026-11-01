"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lightbulb, Loader2, RefreshCw } from "lucide-react";
import { api, ApiError } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";
import { useToast } from "@/components/toast";
import { Button, Card, CardHeader, Chip, Notice, cn } from "@/components/ui";
import { Field, Select, Textarea } from "@/components/forms";
import { SimulatedBadge } from "@/components/ui-i18n";
import { HELP_GRADES, HELP_SUBJECTS, ISSUE_CATEGORIES, ISSUE_STATUSES, type IssueStatus } from "@/lib/help/catalog";
import type { AcademicIssue, IssueSummary } from "@/lib/services/mentor-help";

const STATUS_TONE: Record<IssueStatus, "amber" | "teal" | "neutral"> = { open: "amber", in_progress: "neutral", resolved: "teal" };

export function AcademicPanel({ items, summary, schools, filter }: { items: AcademicIssue[]; summary: IssueSummary; schools: { id: string; name: string }[]; filter: string }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [category, setCategory] = useState<string>("reading");
  const [school, setSchool] = useState("");
  const [grade, setGrade] = useState("");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function create() {
    setBusy("new");
    setError("");
    try {
      const r = await api<AcademicIssue & { suggestion_error: string | null }>("POST", "/help/issues", {
        category, description: text, school_id: school || null, grade: grade ? Number(grade) : null, subject: subject || null,
      });
      setText("");
      if (r.suggestion_error) toast.error(t("mhelp.academic.suggestionFailed", { message: r.suggestion_error }));
      else toast.success(t("mhelp.academic.saved"));
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(id: string, status: IssueStatus) {
    setBusy(id);
    try {
      await api("PATCH", `/help/issues/${id}`, { status });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function suggest(id: string) {
    setBusy(id);
    try {
      await api("POST", `/help/issues/${id}/suggest`, {});
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const fmt = (iso: string) => new Date(iso).toLocaleDateString(locale === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "short" });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
      <div className="space-y-6">
        <Card>
          <CardHeader title={t("mhelp.academic.newTitle")} />
          <form className="space-y-4 px-5 py-5" onSubmit={(e) => { e.preventDefault(); void create(); }}>
            <Field label={t("mhelp.academic.category")} htmlFor="ai-cat">
              <Select id="ai-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
                {ISSUE_CATEGORIES.map((c) => <option key={c} value={c}>{t(`mhelp.cat.${c}`)}</option>)}
              </Select>
            </Field>
            <Field label={t("mhelp.academic.school")} htmlFor="ai-school">
              <Select id="ai-school" value={school} onChange={(e) => setSchool(e.target.value)}>
                <option value="">{t("mhelp.academic.noSchool")}</option>
                {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("mhelp.academic.class")} htmlFor="ai-grade">
                <Select id="ai-grade" value={grade} onChange={(e) => setGrade(e.target.value)}>
                  <option value="">{t("mhelp.academic.any")}</option>
                  {HELP_GRADES.map((g) => <option key={g} value={g}>{t("mhelp.classN", { n: g })}</option>)}
                </Select>
              </Field>
              <Field label={t("mhelp.academic.subject")} htmlFor="ai-subject">
                <Select id="ai-subject" value={subject} onChange={(e) => setSubject(e.target.value)}>
                  <option value="">{t("mhelp.academic.any")}</option>
                  {HELP_SUBJECTS.map((s) => <option key={s} value={s}>{t(`mhelp.subject.${s}`)}</option>)}
                </Select>
              </Field>
            </div>
            <Field label={t("mhelp.academic.what")} hint={t("mhelp.academic.whatHint")} htmlFor="ai-text" required>
              <Textarea id="ai-text" value={text} maxLength={800} onChange={(e) => setText(e.target.value)} required minLength={3} />
            </Field>
            {error && <Notice tone="error">{error}</Notice>}
            <Button type="submit" variant="accent" className="w-full" disabled={busy !== null || text.trim().length < 3}>
              {busy === "new" ? <><Loader2 size={16} className="animate-spin" aria-hidden /> {t("mhelp.academic.saving")}</> : t("mhelp.academic.submit")}
            </Button>
          </form>
        </Card>

        <Card>
          <CardHeader title={t("mhelp.academic.summaryTitle")} />
          <dl className="grid grid-cols-3 gap-2 px-5 py-4 text-center">
            {ISSUE_STATUSES.map((s) => (
              <div key={s} className="rounded-lg bg-ink-50 py-2">
                <dd className="text-xl font-semibold">{summary.by_status[s]}</dd>
                <dt className="text-[12px] text-ink-600">{t(`mhelp.status.${s}`)}</dt>
              </div>
            ))}
          </dl>
          {Object.keys(summary.by_category).length > 0 && (
            <div className="px-5 pb-5">
              <p className="mb-2 text-[13px] font-medium text-ink-600">{t("mhelp.academic.byCategory")}</p>
              <div className="flex flex-wrap gap-1.5">
                {ISSUE_CATEGORIES.filter((c) => summary.by_category[c]).map((c) => <Chip key={c}>{t(`mhelp.cat.${c}`)} · {summary.by_category[c]}</Chip>)}
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="space-y-4">
        <nav aria-label={t("mhelp.academic.listTitle")} className="flex flex-wrap gap-2">
          {[["", t("mhelp.academic.filterAll") + ` (${summary.total})`], ...ISSUE_STATUSES.map((s) => [s, `${t(`mhelp.status.${s}`)} (${summary.by_status[s]})`])].map(([v, label]) => (
            <a
              key={v}
              href={v ? `?status=${v}` : "?"}
              aria-current={filter === v ? "page" : undefined}
              className={cn("inline-flex min-h-10 items-center rounded-full border px-3.5 text-sm", filter === v ? "border-ink-900 bg-ink-900 text-white" : "border-line-strong bg-card hover:bg-ink-50")}
            >
              {label}
            </a>
          ))}
        </nav>

        {items.length === 0 ? (
          <Notice tone="info">{t("mhelp.academic.empty")}</Notice>
        ) : (
          <ul className="space-y-3">
            {items.map((i) => (
              <li key={i.id}>
                <Card className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone={STATUS_TONE[i.status]}>{t(`mhelp.status.${i.status}`)}</Chip>
                    <Chip>{t(`mhelp.cat.${i.category}`)}</Chip>
                    {i.grade && <Chip>{t("mhelp.classN", { n: i.grade })}</Chip>}
                    {i.subject && <Chip>{t(`mhelp.subject.${i.subject}`)}</Chip>}
                    <span className="ml-auto text-[12px] text-ink-600">{t("mhelp.academic.updated")}: {fmt(i.updated_at)}</span>
                  </div>
                  {i.school_name && <p className="text-[13px] font-medium text-ink-600">{i.school_name}</p>}
                  <p lang="hi" className="whitespace-pre-wrap">{i.description}</p>

                  <div className="rounded-lg bg-amber-50 px-3.5 py-3 text-sm text-ink-900">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <p className="flex items-center gap-1.5 font-semibold text-amber-800"><Lightbulb size={15} aria-hidden /> {t("mhelp.academic.suggestion")}</p>
                      {i.suggestion && i.is_simulated && <SimulatedBadge />}
                    </div>
                    {i.suggestion ? (
                      <>
                        <ul lang="hi" className="list-disc space-y-1 pl-5">{i.suggestion.suggestions.map((s, k) => <li key={k}>{s}</li>)}</ul>
                        <p lang="hi" className="mt-2"><strong>{t("mhelp.academic.firstStep")}:</strong> {i.suggestion.first_step}</p>
                      </>
                    ) : (
                      <p className="text-ink-600">{t("mhelp.academic.noSuggestion")}</p>
                    )}
                    <Button variant="ghost" size="sm" className="mt-2" disabled={busy === i.id} onClick={() => void suggest(i.id)}>
                      <RefreshCw size={14} aria-hidden /> {i.suggestion ? t("mhelp.academic.refresh") : t("mhelp.academic.getSuggestion")}
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {i.status === "open" && <Button size="sm" variant="secondary" disabled={busy === i.id} onClick={() => void setStatus(i.id, "in_progress")}>{t("mhelp.academic.setInProgress")}</Button>}
                    {i.status !== "resolved" && <Button size="sm" variant="accent" disabled={busy === i.id} onClick={() => void setStatus(i.id, "resolved")}>{t("mhelp.academic.setResolved")}</Button>}
                    {i.status === "resolved" && <Button size="sm" variant="secondary" disabled={busy === i.id} onClick={() => void setStatus(i.id, "open")}>{t("mhelp.academic.reopen")}</Button>}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
