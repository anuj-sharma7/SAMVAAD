"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Lightbulb, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/client/api";
import { shrinkImage } from "@/lib/client/shrink-image";
import { useI18n } from "@/lib/i18n/client";
import { useToast } from "@/components/toast";
import { Button, Card, CardHeader, Chip, Notice, cn } from "@/components/ui";
import { Field, Select, Textarea } from "@/components/forms";
import { SimulatedBadge } from "@/components/ui-i18n";
import { HELP_GRADES, HELP_SUBJECTS, ISSUE_CATEGORIES, ISSUE_STATUSES, type IssueStatus } from "@/lib/help/catalog";
import type { AcademicIssue, IssueSummary } from "@/lib/services/mentor-help";

const MAX_PHOTOS = 3;
const STATUS_TONE: Record<IssueStatus, "amber" | "teal" | "neutral"> = { open: "amber", in_progress: "neutral", resolved: "teal" };

export function AcademicPanel({ items, summary, schools, filter, defaults }: { items: AcademicIssue[]; summary: IssueSummary; schools: { id: string; name: string }[]; filter: string; defaults?: { school?: string; grade?: number; subject?: string } }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [category, setCategory] = useState<string>("reading");
  const [school, setSchool] = useState(defaults?.school && schools.some((s) => s.id === defaults.school) ? defaults.school : "");
  const [grade, setGrade] = useState(defaults?.grade ? String(defaults.grade) : "");
  const [subject, setSubject] = useState(defaults?.subject ?? "");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const newPhotoInput = useRef<HTMLInputElement>(null);

  /** Shrinks and uploads one photo. Returns an error message instead of throwing, so a failed photo never loses the problem. */
  async function uploadPhoto(issueId: string, file: File): Promise<string | null> {
    try {
      const data_base64 = await shrinkImage(file);
      await api("POST", `/help/issues/${issueId}/photos`, { data_base64 });
      return null;
    } catch (e) {
      if (e instanceof ApiError) return e.message;
      return t("mhelp.academic.photoUnreadable");
    }
  }

  async function addPhoto(issueId: string, file: File) {
    setBusy(issueId);
    const err = await uploadPhoto(issueId, file);
    setBusy(null);
    if (err) toast.error(t("mhelp.academic.photoFailed", { message: err }));
    else { toast.success(t("mhelp.academic.photoAdded")); router.refresh(); }
  }

  async function removePhoto(photoId: string) {
    try {
      await api("DELETE", `/help/photos/${photoId}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : String(e));
    }
  }

  async function create() {
    setBusy("new");
    setError("");
    try {
      const r = await api<AcademicIssue & { suggestion_error: string | null }>("POST", "/help/issues", {
        category, description: text, school_id: school || null, grade: grade ? Number(grade) : null, subject: subject || null,
      });
      setText("");
      let photoError: string | null = null;
      if (photo) {
        photoError = await uploadPhoto(r.id, photo);
        setPhoto(null);
        if (newPhotoInput.current) newPhotoInput.current.value = "";
      }
      if (photoError) toast.error(t("mhelp.academic.photoFailed", { message: photoError }));
      else if (r.suggestion_error) toast.error(t("mhelp.academic.suggestionFailed", { message: r.suggestion_error }));
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
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-ink-900">{t("mhelp.academic.photo")}</p>
              <input ref={newPhotoInput} id="ai-photo" type="file" accept="image/*" className="sr-only" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="ai-photo" className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-line-strong bg-card px-3.5 text-sm font-medium hover:bg-ink-50 focus-within:outline focus-within:outline-2 focus-within:outline-teal-600">
                  <Camera size={16} aria-hidden /> {photo ? t("mhelp.academic.photoChange") : t("mhelp.academic.photoAdd")}
                </label>
                {photo && (
                  <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-600">
                    <span className="max-w-[160px] truncate">{photo.name}</span>
                    <button type="button" className="rounded p-1 text-ink-600 hover:bg-ink-100" aria-label={t("mhelp.academic.photoRemove")} onClick={() => { setPhoto(null); if (newPhotoInput.current) newPhotoInput.current.value = ""; }}><Trash2 size={14} aria-hidden /></button>
                  </span>
                )}
              </div>
              <p className="text-[13px] text-ink-600">{t("mhelp.academic.photoHint")}</p>
            </div>
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

                  <div className="flex flex-wrap items-center gap-3">
                    {i.photos.map((ph, k) => (
                      <div key={ph.id} className="relative">
                        <a href={`/api/v1/help/photos/${ph.id}`} target="_blank" rel="noopener noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/api/v1/help/photos/${ph.id}`} alt={t("mhelp.academic.photoAlt", { n: k + 1 })} loading="lazy" className="h-20 w-20 rounded-lg border border-line object-cover" />
                        </a>
                        <button type="button" aria-label={t("mhelp.academic.photoRemoveN", { n: k + 1 })} className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full border border-line-strong bg-card text-ink-700 shadow hover:bg-red-50" onClick={() => void removePhoto(ph.id)}><Trash2 size={13} aria-hidden /></button>
                      </div>
                    ))}
                    {i.photos.length < MAX_PHOTOS && (
                      <>
                        <input id={`ph-${i.id}`} type="file" accept="image/*" className="sr-only" disabled={busy === i.id} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void addPhoto(i.id, f); }} />
                        <label htmlFor={`ph-${i.id}`} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line-strong px-3.5 text-sm font-medium text-ink-700 hover:bg-ink-50 focus-within:outline focus-within:outline-2 focus-within:outline-teal-600">
                          <Camera size={16} aria-hidden /> {t("mhelp.academic.photoAdd")}
                        </label>
                      </>
                    )}
                  </div>

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
